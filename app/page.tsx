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
  // Reglas por defecto, pero ahora 100% editables desde la UI
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
      // Si el torneo ya tiene reglas guardadas, las cargamos. Si no, usamos las por defecto.
      if (rDoc.exists() && rDoc.data().win !== undefined) {
          setScoringRules(rDoc.data() as any);
      } else {
          setScoringRules({ win: 3, loss: 0, winWO: 3, lossWO: 0 });
      }
    }
    loadConfig();

    return onSnapshot(query(collection(db, "tournaments", activeTournament.id, "matches"), orderBy("createdAt", "desc")), (snap) => {
      setReportedMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [activeTournament, isAdmin]);

  const handleCreate = async () => {
    if(!newT.name || !newT.price) return alert("Faltan datos");
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

  const handleAddManualMatch = async () => {
    await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { ...manualMatch, status: 'approved', createdAt: serverTimestamp() });
    setIsManualModalOpen(false);
  };

  // CÁLCULO DE POSICIONES (Usa las reglas que el admin configure)
  const calculateStandings = (groupName: string) => {
    const players = groups[groupName] || [];
    let stats: any = {};
    players.forEach((p: any) => { stats[p.name] = { name: p.name, PJ: 0, PG: 0, PP: 0, Pts: 0, GW: 0, GL: 0 }; });

    const isPastDeadline = activeTournament?.endDate ? new Date() > new Date(activeTournament.endDate) : false;
    const validMatches = reportedMatches.filter(m => m.groupName === groupName && (m.status === 'approved' || (m.status === 'pending' && isPastDeadline)));

    validMatches.forEach(m => {
      const isWO = m.score.toUpperCase() === 'WO';
      const winner = stats[m.winnerName]; const loser = stats[m.loserName];

      if(winner) { 
          winner.PJ++; winner.PG++; 
          // Aquí suma lo que pusiste en los inputs
          winner.Pts += isWO ? scoringRules.winWO : scoringRules.win; 
          if(isWO) winner.GW += 12; 
      }
      if(loser) { 
          loser.PJ++; loser.PP++; 
          // Aquí suma (o resta) lo que pusiste en los inputs
          loser.Pts += isWO ? scoringRules.lossWO : scoringRules.loss; 
          if(isWO) loser.GL += 12; 
      }

      if(!isWO && winner && loser && m.score) {
        const sets = m.score.trim().split(' ');
        sets.forEach((set: string) => {
          const parts = set.split('-');
          if(parts.length === 2) {
            let w = parseInt(parts[0]); let l = parseInt(parts[1]); 
            if(!isNaN(w) && !isNaN(l)) {
              if(w >= 10 || l >= 10 || (w === 7 && l === 6) || (w === 6 && l === 7)) {
                winner.GW += (w > l ? 1 : 0); loser.GW += (l > w ? 1 : 0);
              } else {
                winner.GW += w; winner.GL += l; loser.GW += l; loser.GL += w;
              }
            }
          }
        });
      }
    });

    return Object.values(stats).map((s: any) => {
      const totalGames = s.GW + s.GL;
      s.pctGames = totalGames === 0 ? 0 : (s.GW / totalGames) * 100;
      return s;
    }).sort((a: any, b: any) => b.Pts !== a.Pts ? b.Pts - a.Pts : b.pctGames - a.pctGames);
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
               {['groups', 'history', 'standings', 'rules', 'settings'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-6 py-2 rounded-full text-xs font-black uppercase transition ${step === s ? 'bg-white shadow-md text-black' : 'text-slate-400 hover:text-slate-600'}`}>
                    {s === 'rules' ? 'Puntuación' : s === 'history' ? 'Resultados' : s === 'standings' ? 'Posiciones' : s === 'groups' ? 'Grupos' : 'Peligro'}
                 </button>
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
                            <button onClick={() => setGroups({...groups, "Grupo A": [...(groups["Grupo A"]||[]), p]})} className="bg-white border px-2 py-1 rounded text-[10px] font-black hover:bg-green-500 hover:text-white">+A</button>
                            <button onClick={() => setGroups({...groups, "Grupo B": [...(groups["Grupo B"]||[]), p]})} className="bg-white border px-2 py-1 rounded text-[10px] font-black hover:bg-blue-500 hover:text-white">+B</button>
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
                          <div key={p.id} className="bg-white p-2 mb-2 rounded-lg shadow-sm text-sm font-bold border flex justify-between items-center">
                            {p.name}
                            <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-red-400 font-bold hover:bg-red-50 px-2 rounded">&times;</button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="col-span-2 mt-4">
                      <button onClick={async () => {
                        await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups});
                        alert("Grupos guardados");
                      }} className="w-full bg-black text-white p-4 rounded-2xl font-black shadow-lg hover:bg-slate-800">SINCRONIZAR GRUPOS CON LA APP</button>
                    </div>
                  </div>
                </div>
              )}

              {/* 🔥 NUEVA SECCIÓN DE REGLAS MANUALES */}
              {step === 'rules' && (
                <div className="max-w-3xl mx-auto">
                  <div className="mb-8">
                    <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Configuración de Puntos</h3>
                    <p className="text-slate-500">Define cuántos puntos exactos se otorgan para la tabla de posiciones en cada situación.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="bg-slate-50 p-6 rounded-2xl border">
                      <label className="block text-xs font-black text-slate-400 mb-2 uppercase">Puntos por Victoria Normal</label>
                      <input type="number" value={scoringRules.win} onChange={e => setScoringRules({...scoringRules, win: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 rounded-xl focus:border-green-500 outline-none" />
                    </div>
                    <div className="bg-slate-50 p-6 rounded-2xl border">
                      <label className="block text-xs font-black text-slate-400 mb-2 uppercase">Puntos por Derrota Normal</label>
                      <input type="number" value={scoringRules.loss} onChange={e => setScoringRules({...scoringRules, loss: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 rounded-xl focus:border-green-500 outline-none" />
                    </div>
                    <div className="bg-green-50 p-6 rounded-2xl border border-green-100">
                      <label className="block text-xs font-black text-green-600 mb-2 uppercase">Victoria por W.O. (Walkover)</label>
                      <input type="number" value={scoringRules.winWO} onChange={e => setScoringRules({...scoringRules, winWO: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 rounded-xl focus:border-green-500 outline-none bg-white" />
                    </div>
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-100">
                      <label className="block text-xs font-black text-red-600 mb-2 uppercase">Derrota por W.O. (Penalización)</label>
                      <input type="number" value={scoringRules.lossWO} onChange={e => setScoringRules({...scoringRules, lossWO: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 rounded-xl focus:border-red-500 outline-none bg-white" />
                      <p className="text-xs text-red-400 mt-2 font-bold">* Puedes usar números negativos (ej: -2)</p>
                    </div>
                  </div>

                  <button onClick={async () => {
                        await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true });
                        alert("Reglas de Puntuación Actualizadas en la Nube");
                      }} className="w-full bg-green-600 text-white p-4 rounded-2xl font-black shadow-lg hover:bg-green-700">GUARDAR REGLAS Y RECALCULAR TABLA</button>
                </div>
              )}

              {step === 'history' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase text-slate-400">Registro de Resultados</h3>
                    <button onClick={() => setIsManualModalOpen(true)} className="bg-black text-white px-6 py-2 rounded-full font-bold">+ Resultado Manual</button>
                  </div>
                  <div className="space-y-4">
                    {reportedMatches.length === 0 && <p className="text-slate-400 text-center py-10 font-bold border-2 border-dashed rounded-2xl">Aún no hay partidos registrados</p>}
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

              {step === 'standings' && (
                <div>
                   <h3 className="font-black uppercase text-slate-400 mb-6">Tabla de Posiciones en Tiempo Real</h3>
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {Object.keys(groups).map((gName) => {
                          const standings = calculateStandings(gName); 
                          return (
                              <div key={gName} className="border-2 rounded-2xl overflow-hidden">
                                  <div className="bg-slate-900 p-4"><h4 className="font-black text-white">{gName}</h4></div>
                                  <table className="w-full text-left">
                                      <thead className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase">
                                          <tr><th className="p-4">Jugador</th><th className="p-4 text-center">PJ</th><th className="p-4 text-center">PG</th><th className="p-4 text-center">%G</th><th className="p-4 text-center text-black">PTS</th></tr>
                                      </thead>
                                      <tbody>
                                          {standings.map((s: any, i: number) => (
                                              <tr key={s.name} className="border-t hover:bg-slate-50"><td className="p-4 font-bold"><span className="text-slate-300 mr-2">{i+1}</span>{s.name}</td><td className="p-4 text-center">{s.PJ}</td><td className="p-4 text-center">{s.PG}</td><td className="p-4 text-center text-slate-500 text-xs">{s.pctGames.toFixed(0)}%</td><td className="p-4 text-center font-black text-lg text-green-600">{s.Pts}</td></tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          );
                      })}
                   </div>
                </div>
              )}

              {step === 'settings' && (
                <div className="py-20 text-center">
                  <div className="max-w-md mx-auto p-10 border-4 border-red-50 border-dashed rounded-3xl">
                    <h3 className="text-2xl font-black mb-4">Zona de Peligro</h3>
                    <p className="text-slate-400 text-sm mb-8">Si borras este torneo, se eliminarán todos los jugadores de las tablas y el historial para siempre.</p>
                    <button onClick={handleDeleteFull} className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-red-700 transition">ELIMINAR TODO EL TORNEO</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Manual con Autocompletado */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-6 uppercase tracking-tighter">Nuevo Torneo</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Nombre (ej: Torneo Verano)" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setNewT({...newT, name: e.target.value})} />
              <input type="number" placeholder="Precio de Inscripción" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setNewT({...newT, price: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-bold text-slate-400">Inicio</label><input type="date" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setNewT({...newT, startDate: e.target.value})} /></div>
                <div><label className="text-xs font-bold text-slate-400">Fin</label><input type="date" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setNewT({...newT, endDate: e.target.value})} /></div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-4 border-2 rounded-xl font-bold">Cancelar</button>
              <button onClick={handleCreate} className="flex-1 p-4 bg-green-600 text-white rounded-xl font-black">CREAR</button>
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
                 <option>Elegir Grupo...</option>
                 {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})}>
                 <option>Ganador...</option>
                 {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}>
                 <option>Perdedor...</option>
                 {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
              <input type="text" placeholder="Score (ej: 6-4 6-2 o WO)" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setManualMatch({...manualMatch, score: e.target.value})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsManualModalOpen(false)} className="flex-1 p-4 border-2 rounded-xl font-bold">Cancelar</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-4 bg-black text-white rounded-xl font-black">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}