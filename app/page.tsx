"use client";

import React, { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase'; 
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc 
} from 'firebase/firestore';

export default function AdminFinalMaster() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [view, setView] = useState('main'); 
  const [step, setStep] = useState('groups'); 
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [activeTournament, setActiveTournament] = useState<any>(null);
  const [appPlayers, setAppPlayers] = useState<any[]>([]);
  const [reportedMatches, setReportedMatches] = useState<any[]>([]); 
  
  const [newT, setNewT] = useState({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Activo' });
  const [editT, setEditT] = useState<any>({}); 
  const [manualMatch, setManualMatch] = useState({ winnerName: '', loserName: '', score: '', groupName: '' });

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: 0 });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
        setIsAdmin(adminDoc.exists());
      } else {
        setUser(null);
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubT = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), (snap) => {
      setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const fetchPlayers = async () => {
      const snap = await getDocs(collection(db, "players")); 
      setAppPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchPlayers();
    return () => unsubT();
  }, [isAdmin]);

  useEffect(() => {
    if (!activeTournament || !isAdmin) return;
    setEditT(activeTournament);
    setGroups({ "Grupo A": [], "Grupo B": [] });
    
    const loadConfig = async () => {
      const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      if (gDoc.exists()) setGroups(gDoc.data().structure);
      const rDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
      if (rDoc.exists()) setScoringRules(rDoc.data() as any);
    }
    loadConfig();

    return onSnapshot(query(collection(db, "tournaments", activeTournament.id, "matches"), orderBy("createdAt", "desc")), (snap) => {
      setReportedMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [activeTournament, isAdmin]);

  const handleCreate = async () => {
    if(!newT.name || !newT.price) return alert("Faltan datos");
    // Aseguramos que el status sea 'Activo' para que la App lo vea
    await addDoc(collection(db, "tournaments"), { ...newT, status: 'Activo', createdAt: serverTimestamp() });
    setIsModalOpen(false);
  };

  const handleDeleteFull = async () => {
    if (prompt("Escribe ELIMINAR") !== 'ELIMINAR') return;
    const matches = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
    await Promise.all(matches.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "tournaments", activeTournament.id));
    setView('main');
  };

  if (authLoading) return <div className="p-20 text-center font-bold">Cargando Sistema...</div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-sm">
        <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tighter">Acceso Admin</h1>
        <input type="email" placeholder="Email" className="w-full p-4 mb-4 border-2 rounded-lg font-bold" onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" className="w-full p-4 mb-6 border-2 rounded-lg font-bold" onChange={e => setPassword(e.target.value)} />
        <button onClick={() => signInWithEmailAndPassword(auth, email, password)} className="w-full bg-black text-white p-4 rounded-lg font-black hover:bg-slate-800 transition">ENTRAR</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {view === 'main' ? (
        <div className="p-10">
          <div className="flex justify-between items-center mb-10 border-b pb-6">
            <h1 className="text-4xl font-black tracking-tighter uppercase">Panel Maestro</h1>
            <button onClick={() => setIsModalOpen(true)} className="bg-green-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition">+ Crear Torneo</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tournaments.map(t => (
              <div key={t.id} className="bg-white p-6 rounded-2xl border-2 border-slate-100 shadow-sm hover:border-slate-300 transition">
                <h2 className="text-xl font-black mb-1">{t.name}</h2>
                <div className="flex gap-2 mb-4">
                  <span className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded uppercase">{t.category}</span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${t.status === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{t.status}</span>
                </div>
                <button onClick={() => { setActiveTournament(t); setView('manage'); }} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">Gestionar</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => setView('main')} className="bg-white border p-2 rounded-full shadow-sm hover:bg-slate-100">&larr;</button>
            <h2 className="text-2xl font-black uppercase tracking-tight">{activeTournament.name}</h2>
          </div>
          
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex bg-slate-50 p-2 gap-2 border-b">
               {['groups', 'history', 'standings', 'settings'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-6 py-2 rounded-full text-xs font-black uppercase transition ${step === s ? 'bg-white shadow-md text-black' : 'text-slate-400 hover:text-slate-600'}`}>{s}</button>
               ))}
            </div>

            <div className="p-8">
              {step === 'groups' && (
                <div className="grid grid-cols-12 gap-10">
                  <div className="col-span-4 border-r pr-10">
                    <h3 className="font-black text-sm uppercase mb-4 text-slate-400">Base de Datos</h3>
                    <input type="text" placeholder="Buscar jugador..." className="w-full p-3 border-2 rounded-xl mb-4 outline-none focus:border-green-500" onChange={e => setSearch(e.target.value)} />
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {appPlayers.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())).map(p => (
                        <div key={p.id} className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center group">
                          <span className="font-bold text-sm">{p.name}</span>
                          <div className="flex gap-1">
                            <button onClick={() => setGroups({...groups, "Grupo A": [...groups["Grupo A"], p]})} className="bg-white border px-2 py-1 rounded text-[10px] font-black hover:bg-green-500 hover:text-white">+A</button>
                            <button onClick={() => setGroups({...groups, "Grupo B": [...groups["Grupo B"], p]})} className="bg-white border px-2 py-1 rounded text-[10px] font-black hover:bg-blue-500 hover:text-white">+B</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-8 grid grid-cols-2 gap-6">
                    {Object.keys(groups).map(g => (
                      <div key={g} className="bg-slate-50 p-4 rounded-2xl border-2 border-dashed border-slate-200">
                        <h4 className="font-black uppercase text-xs mb-4 text-slate-500">{g}</h4>
                        {groups[g].map((p: any) => (
                          <div key={p.id} className="bg-white p-2 mb-2 rounded-lg shadow-sm text-sm font-bold border flex justify-between">
                            {p.name}
                            <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-red-400">&times;</button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="col-span-2 mt-4">
                      <button onClick={async () => {
                        await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups});
                        alert("Grupos guardados");
                      }} className="w-full bg-black text-white p-4 rounded-2xl font-black shadow-lg">SINCRONIZAR GRUPOS CON LA APP</button>
                    </div>
                  </div>
                </div>
              )}

              {step === 'history' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase text-slate-400">Registro de Resultados</h3>
                    <button onClick={() => setIsManualModalOpen(true)} className="bg-black text-white px-6 py-2 rounded-full font-bold">+ Resultado Manual</button>
                  </div>
                  <div className="space-y-4">
                    {reportedMatches.map(m => (
                      <div key={m.id} className="p-4 bg-white border-2 rounded-2xl flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-full uppercase mr-2">{m.groupName}</span>
                          <span className="font-bold">{m.winnerName} <span className="text-slate-400 mx-2">vs</span> {m.loserName}</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <span className="font-black text-xl">{m.score}</span>
                          <button onClick={() => deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id))} className="text-red-500 font-bold hover:bg-red-50 p-2 rounded-full transition">🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 'settings' && (
                <div className="py-20 text-center">
                  <div className="max-w-md mx-auto p-10 border-4 border-red-50 border-dashed rounded-3xl">
                    <h3 className="text-2xl font-black mb-4">Zona de Peligro</h3>
                    <p className="text-slate-400 text-sm mb-8">Si borras este torneo, se eliminarán todos los jugadores de las tablas y el historial de fotos para siempre.</p>
                    <button onClick={handleDeleteFull} className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-red-700 transition">ELIMINAR TODO EL TORNEO</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-6 uppercase tracking-tighter">Añadir Resultado</h2>
            <div className="space-y-4">
              <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => setManualMatch({...manualMatch, groupName: e.target.value})}>
                 <option>Elegir Grupo</option>
                 {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})}>
                 <option>Ganador</option>
                 {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}>
                 <option>Perdedor</option>
                 {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <input type="text" placeholder="Score (ej: 6-4 6-2)" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setManualMatch({...manualMatch, score: e.target.value})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsManualModalOpen(false)} className="flex-1 p-4 border-2 rounded-xl font-bold">Cancelar</button>
              <button onClick={async () => {
                await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { ...manualMatch, status: 'approved', createdAt: serverTimestamp() });
                setIsManualModalOpen(false);
              }} className="flex-1 p-4 bg-black text-white rounded-xl font-black">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}