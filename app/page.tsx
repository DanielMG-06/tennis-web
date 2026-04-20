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
  const [bracketMatches, setBracketMatches] = useState<any[]>([]); 
  
  const [newT, setNewT] = useState({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Inscripciones' });
  const [editT, setEditT] = useState<any>({}); 
  const [manualMatch, setManualMatch] = useState({ winnerName: '', loserName: '', score: '', groupName: '', type: 'group' });

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: -2 }); // Por defecto

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
    
    // Limpiamos al entrar
    setGroups({ "Grupo A": [], "Grupo B": [] });
    setReportedMatches([]);
    setBracketMatches([]);

    const loadConfig = async () => {
      const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      if (gDoc.exists() && gDoc.data().structure) setGroups(gDoc.data().structure);
      
      const rDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
      if (rDoc.exists() && rDoc.data().win !== undefined) {
        setScoringRules(rDoc.data() as any);
      } else {
        setScoringRules({ win: 3, loss: 0, winWO: 3, lossWO: -2 });
      }
    }
    loadConfig();

    const unsubM = onSnapshot(query(collection(db, "tournaments", activeTournament.id, "matches"), orderBy("createdAt", "desc")), (snap) => {
      setReportedMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubB = onSnapshot(query(collection(db, "tournaments", activeTournament.id, "bracket_matches"), orderBy("createdAt", "asc")), (snap) => {
      setBracketMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubM(); unsubB(); };
  }, [activeTournament, isAdmin]);

  const handleCreate = async () => {
    if(!newT.name || !newT.price) return alert("Faltan datos");
    await addDoc(collection(db, "tournaments"), { ...newT, participantsIds: [], createdAt: serverTimestamp() });
    setIsModalOpen(false);
  };

  const handleDeleteFull = async () => {
    if (prompt("Escribe ELIMINAR") !== 'ELIMINAR') return;
    const matches = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
    await Promise.all(matches.docs.map(d => deleteDoc(d.ref)));
    
    await deleteDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
    await deleteDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
    await deleteDoc(doc(db, "tournaments", activeTournament.id));
    setView('main');
  };

  const handleAddManualMatch = async () => {
    if (!manualMatch.groupName || !manualMatch.winnerName || !manualMatch.loserName || !manualMatch.score) {
      return alert("Completa todos los campos");
    }
    if (manualMatch.type === 'group') {
      await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { 
        groupName: manualMatch.groupName,
        winnerName: manualMatch.winnerName,
        loserName: manualMatch.loserName,
        player1: manualMatch.winnerName, 
        player2: manualMatch.loserName, 
        score: manualMatch.score,
        status: 'approved', 
        createdAt: serverTimestamp() 
      });
    } else {
      await updateDoc(doc(db, "tournaments", activeTournament.id, "bracket_matches", manualMatch.groupName), { 
        winnerName: manualMatch.winnerName, 
        loserName: manualMatch.loserName, 
        score: manualMatch.score, 
        status: 'approved' 
      });
    }
    setIsManualModalOpen(false);
    setManualMatch({ winnerName: '', loserName: '', score: '', groupName: '', type: 'group' });
  };

  const handleGenerateFixture = async () => {
    if (!confirm("Esto creará el fixture y cambiará el estado a Activo. ¿Continuar?")) return;
    const matchesRef = collection(db, "tournaments", activeTournament.id, "matches");
    for (const groupName of Object.keys(groups)) {
      const players = groups[groupName];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          await addDoc(matchesRef, {
            groupName: groupName, player1: players[i].name, player2: players[j].name,
            winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp()
          });
        }
      }
    }
    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Activo' });
    setActiveTournament({...activeTournament, status: 'Activo'});
    alert("Fixture generado!");
  };

  const handleGenerateBrackets = async () => {
    if (!confirm("¿Dar por terminada la fase de grupos y generar Semifinales?")) return;
    const standingsA = calculateStandings("Grupo A");
    const standingsB = calculateStandings("Grupo B");
    if (standingsA.length < 2 || standingsB.length < 2) return alert("Faltan jugadores para las llaves.");
    const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
    
    await addDoc(bracketRef, { round: 'Semifinal 1', player1: standingsA[0].name, player2: standingsB[1].name, winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp() });
    await addDoc(bracketRef, { round: 'Semifinal 2', player1: standingsB[0].name, player2: standingsA[1].name, winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp() });

    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Fase Final' });
    setActiveTournament({...activeTournament, status: 'Fase Final'});
    alert("Llaves generadas!");
  };

  const calculateStandings = (groupName: string) => {
    const players = groups[groupName] || [];
    let stats: any = {};
    players.forEach((p: any) => { stats[p.name] = { name: p.name, PJ: 0, PG: 0, PP: 0, Pts: 0, GW: 0, GL: 0 }; });

    const validMatches = reportedMatches.filter(m => m.groupName === groupName && m.status === 'approved');

    validMatches.forEach(m => {
      const isWO = m.score.toUpperCase() === 'WO';
      const winner = stats[m.winnerName]; const loser = stats[m.loserName];

      if(winner) { winner.PJ++; winner.PG++; winner.Pts += isWO ? scoringRules.winWO : scoringRules.win; if(isWO) winner.GW += 12; }
      if(loser) { loser.PJ++; loser.PP++; loser.Pts += isWO ? scoringRules.lossWO : scoringRules.loss; if(isWO) loser.GL += 12; }

      if(!isWO && winner && loser && m.score) {
        const sets = m.score.trim().split(' ');
        sets.forEach((set: string) => {
          const parts = set.split('-');
          if(parts.length === 2) {
            let w = parseInt(parts[0]); let l = parseInt(parts[1]); 
            if(!isNaN(w) && !isNaN(l)) {
              if(w >= 10 || l >= 10 || (w === 7 && l === 6) || (w === 6 && l === 7)) { winner.GW += (w > l ? 1 : 0); loser.GW += (l > w ? 1 : 0); } 
              else { winner.GW += w; winner.GL += l; loser.GW += l; loser.GL += w; }
            }
          }
        });
      }
    });

    return Object.values(stats).map((s: any) => {
      const totalGames = s.GW + s.GL; s.pctGames = totalGames === 0 ? 0 : (s.GW / totalGames) * 100; return s;
    }).sort((a: any, b: any) => b.Pts !== a.Pts ? b.Pts - a.Pts : b.pctGames - a.pctGames);
  };

  if (authLoading) return <div className="p-20 text-center font-bold">Cargando...</div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-10 rounded-3xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tighter">Acceso Admin</h1>
        <input type="email" placeholder="Email" className="w-full p-4 mb-4 border-2 rounded-xl font-bold" onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" className="w-full p-4 mb-6 border-2 rounded-xl font-bold" onChange={e => setPassword(e.target.value)} />
        <button onClick={() => signInWithEmailAndPassword(auth, email, password)} className="w-full bg-black text-white p-4 rounded-xl font-black">ENTRAR</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {view === 'main' ? (
        <div className="p-10 max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-10 border-b pb-6">
            <h1 className="text-4xl font-black tracking-tighter uppercase">Panel Maestro</h1>
            <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition">+ Crear Torneo</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {tournaments.map(t => (
              <div key={t.id} className="bg-white p-6 rounded-3xl border-2 border-slate-100 shadow-sm hover:border-slate-300 transition">
                <h2 className="text-2xl font-black mb-1">{t.name}</h2>
                <div className="flex gap-2 mb-6 mt-2">
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase ${t.status === 'Inscripciones' ? 'bg-blue-100 text-blue-700' : t.status === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{t.status}</span>
                </div>
                <button onClick={() => { setActiveTournament(t); setStep('groups'); setView('manage'); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold">Gestionar</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-6xl mx-auto">
          {/* HEADER DEL TORNEO (Basado en tu captura) */}
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => setView('main')} className="bg-white border-2 border-slate-200 h-10 w-10 flex items-center justify-center rounded-full shadow-sm hover:bg-slate-100 font-bold">&larr;</button>
            <h2 className="text-3xl font-black uppercase tracking-tight">{activeTournament.name}</h2>
            <span className="text-xs font-bold text-slate-500 bg-slate-200 px-3 py-1 rounded-full">{activeTournament.status}</span>
            
            {/* BOTÓN MORADO A LA DERECHA */}
            {activeTournament.status === 'Inscripciones' && (
              <button onClick={handleGenerateFixture} className="ml-auto bg-purple-600 text-white px-6 py-2 rounded-xl font-bold shadow-md">Generar Fixture y Activar Torneo &rarr;</button>
            )}
            {activeTournament.status === 'Activo' && (
              <button onClick={handleGenerateBrackets} className="ml-auto bg-purple-600 text-white px-6 py-2 rounded-xl font-bold shadow-md">Terminar Grupos y Crear Llaves &rarr;</button>
            )}
            {activeTournament.status === 'Fase Final' && (
              <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id), {status: 'Completado'})} className="ml-auto bg-black text-white px-6 py-2 rounded-xl font-bold shadow-md">Finalizar Torneo 🏆</button>
            )}
          </div>
          
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            {/* PESTAÑAS REDONDEADAS (Como tu captura) */}
            <div className="flex bg-white px-4 pt-4 gap-2 border-b">
               {['groups', 'standings', 'history', 'brackets', 'rules', 'settings'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-6 py-3 rounded-t-2xl text-xs font-black uppercase transition ${step === s ? 'bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] text-black border-t-2 border-x-2 border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>
                    {s === 'groups' ? 'GRUPOS' : s === 'standings' ? 'POSICIONES' : s === 'history' ? 'RESULTADOS' : s === 'brackets' ? 'LLAVES' : s === 'rules' ? 'REGLAS' : 'AJUSTES'}
                 </button>
               ))}
            </div>

            <div className="p-8 bg-slate-50 min-h-[500px]">
              
              {/* 1. GRUPOS */}
              {step === 'groups' && (
                <div className="grid grid-cols-12 gap-10">
                  <div className="col-span-4 border-r pr-10">
                    <h3 className="font-black text-sm uppercase mb-4 text-slate-400">Jugadores Registrados</h3>
                    <input type="text" placeholder="Buscar jugador..." className="w-full p-3 border-2 rounded-xl mb-4 outline-none font-bold" onChange={e => setSearch(e.target.value)} />
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {appPlayers.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())).map(p => (
                        <div key={p.id} className="p-3 bg-white rounded-xl border flex justify-between items-center shadow-sm">
                          <span className="font-bold text-sm">{p.name}</span>
                          <div className="flex gap-1">
                            <button onClick={() => setGroups({...groups, "Grupo A": [...(groups["Grupo A"]||[]), p]})} className="bg-slate-100 border px-2 py-1 rounded text-[10px] font-black hover:bg-black hover:text-white">+A</button>
                            <button onClick={() => setGroups({...groups, "Grupo B": [...(groups["Grupo B"]||[]), p]})} className="bg-slate-100 border px-2 py-1 rounded text-[10px] font-black hover:bg-black hover:text-white">+B</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-8">
                    <div className="grid grid-cols-2 gap-6">
                      {Object.keys(groups).map(g => (
                        <div key={g} className="bg-white p-6 rounded-3xl border-2 border-slate-200 shadow-sm">
                          <h4 className="font-black uppercase text-lg mb-4">{g}</h4>
                          {groups[g].map((p: any) => (
                            <div key={p.id} className="bg-slate-50 p-3 mb-2 rounded-xl text-sm font-bold border flex justify-between items-center">
                              {p.name}
                              <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-slate-400 hover:text-red-500 font-black px-2 rounded">&times;</button>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups}); alert("Grupos guardados en la nube"); }} className="mt-8 w-full bg-black text-white p-4 rounded-2xl font-black shadow-lg hover:bg-slate-800">GUARDAR GRUPOS</button>
                  </div>
                </div>
              )}

              {/* 2. REGLAS (Diseño hermoso restaurado) */}
              {step === 'rules' && (
                <div className="max-w-4xl mx-auto">
                  <div className="mb-8">
                    <h3 className="text-2xl font-black mb-2 uppercase tracking-tight">Configuración de Puntuación</h3>
                    <p className="text-slate-500 font-bold">Modifica el valor de cada acción. La tabla se recalculará automáticamente.</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-3xl border-2 shadow-sm">
                      <label className="block text-xs font-black text-slate-400 mb-2 uppercase">Puntos por Victoria</label>
                      <input type="number" value={scoringRules.win} onChange={e => setScoringRules({...scoringRules, win: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 rounded-2xl bg-slate-50 focus:border-black outline-none text-green-600" />
                    </div>
                    <div className="bg-white p-6 rounded-3xl border-2 shadow-sm">
                      <label className="block text-xs font-black text-slate-400 mb-2 uppercase">Puntos por Derrota</label>
                      <input type="number" value={scoringRules.loss} onChange={e => setScoringRules({...scoringRules, loss: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 rounded-2xl bg-slate-50 focus:border-black outline-none text-slate-700" />
                    </div>
                    <div className="bg-green-50 p-6 rounded-3xl border-2 border-green-200">
                      <label className="block text-xs font-black text-green-700 mb-2 uppercase">Victoria por W.O. (Walkover)</label>
                      <input type="number" value={scoringRules.winWO} onChange={e => setScoringRules({...scoringRules, winWO: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 rounded-2xl bg-white focus:border-green-500 outline-none text-green-700" />
                    </div>
                    <div className="bg-red-50 p-6 rounded-3xl border-2 border-red-200">
                      <label className="block text-xs font-black text-red-700 mb-2 uppercase">Derrota por W.O. (Penalización)</label>
                      <input type="number" value={scoringRules.lossWO} onChange={e => setScoringRules({...scoringRules, lossWO: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 rounded-2xl bg-white focus:border-red-500 outline-none text-red-600" />
                    </div>
                  </div>

                  <button onClick={async () => {
                        await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true });
                        alert("Reglas Actualizadas");
                      }} className="w-full bg-black text-white p-5 rounded-2xl font-black shadow-lg text-lg">GUARDAR REGLAS Y APLICAR A LA TABLA</button>
                </div>
              )}

              {/* 3. RESULTADOS E HISTORIAL */}
              {step === 'history' && (
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase text-slate-400">Resultados Confirmados</h3>
                    <button onClick={() => { setManualMatch({...manualMatch, type: 'group'}); setIsManualModalOpen(true); }} className="bg-black text-white px-6 py-3 rounded-full font-bold shadow-md">+ Añadir Resultado Manual</button>
                  </div>
                  <div className="space-y-4">
                    {reportedMatches.filter(m => m.status === 'approved').length === 0 && <p className="text-slate-400 text-center py-10 font-bold bg-white border-2 rounded-3xl">Aún no hay partidos confirmados.</p>}
                    {reportedMatches.filter(m => m.status === 'approved').map(m => (
                      <div key={m.id} className="p-5 bg-white border-2 border-slate-200 shadow-sm rounded-2xl flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-black bg-slate-100 px-3 py-1 rounded-full uppercase mr-3">{m.groupName}</span>
                          <span className="font-black text-lg">{m.winnerName} <span className="text-slate-300 mx-2 text-sm">vs</span> {m.loserName}</span>
                        </div>
                        <div className="flex items-center gap-6">
                          <span className="font-black text-2xl">{m.score}</span>
                          <button onClick={() => deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id))} className="text-red-400 hover:text-red-600 font-bold bg-red-50 p-2 rounded-xl transition">Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. POSICIONES */}
              {step === 'standings' && (
                <div>
                   <h3 className="font-black uppercase text-slate-400 mb-6">Tabla General</h3>
                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                      {Object.keys(groups).map((gName) => {
                          const standings = calculateStandings(gName); 
                          return (
                              <div key={gName} className="bg-white border-2 shadow-sm rounded-3xl overflow-hidden">
                                  <div className="bg-black p-4"><h4 className="font-black text-white">{gName}</h4></div>
                                  <table className="w-full text-left">
                                      <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase border-b-2">
                                          <tr><th className="p-4">Jugador</th><th className="p-4 text-center">PJ</th><th className="p-4 text-center">PG</th><th className="p-4 text-center">PTS</th></tr>
                                      </thead>
                                      <tbody>
                                          {standings.map((s: any, i: number) => (
                                              <tr key={s.name} className="border-b hover:bg-slate-50">
                                                <td className="p-4 font-black"><span className="text-slate-300 mr-3">{i+1}</span>{s.name}</td>
                                                <td className="p-4 text-center font-bold">{s.PJ}</td>
                                                <td className="p-4 text-center font-bold">{s.PG}</td>
                                                <td className="p-4 text-center font-black text-xl text-green-600">{s.Pts}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          );
                      })}
                   </div>
                </div>
              )}

              {/* 5. LLAVES */}
              {step === 'brackets' && (
                <div className="max-w-4xl mx-auto">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase text-slate-400">Fase Final</h3>
                    <button onClick={() => { setManualMatch({...manualMatch, type: 'bracket'}); setIsManualModalOpen(true); }} className="bg-purple-600 text-white px-6 py-3 rounded-full font-bold shadow-md">+ Resultado Manual de Llave</button>
                  </div>
                  {bracketMatches.length === 0 ? (
                    <div className="text-center py-10 bg-white border-2 border-dashed rounded-3xl font-bold text-slate-400">Las llaves se generarán cuando termines la fase de grupos.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      {bracketMatches.map(bm => (
                        <div key={bm.id} className="border-2 rounded-3xl p-6 bg-white shadow-sm">
                          <h4 className="font-black text-purple-600 text-xs uppercase mb-4 tracking-widest">{bm.round}</h4>
                          <div className={`p-4 rounded-2xl border-2 mb-3 font-bold flex justify-between ${bm.winnerName === bm.player1 ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
                            <span>{bm.player1}</span> {bm.winnerName === bm.player1 && <span className="text-green-600">🏆</span>}
                          </div>
                          <div className={`p-4 rounded-2xl border-2 font-bold flex justify-between ${bm.winnerName === bm.player2 ? 'border-green-400 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
                            <span>{bm.player2}</span> {bm.winnerName === bm.player2 && <span className="text-green-600">🏆</span>}
                          </div>
                          <p className="mt-4 text-center font-black text-xl">{bm.status === 'approved' ? bm.score : <span className="text-orange-400 text-sm">Pendiente de jugar</span>}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 6. ZONA DE PELIGRO */}
              {step === 'settings' && (
                <div className="py-20 text-center">
                  <div className="max-w-md mx-auto p-10 bg-white border-4 border-red-100 border-dashed rounded-3xl">
                    <h3 className="text-2xl font-black mb-4">Zona de Peligro</h3>
                    <p className="text-slate-400 font-bold mb-8">Borrar este torneo eliminará a todos los jugadores, tablas y el historial de Firebase. No se puede deshacer.</p>
                    <button onClick={handleDeleteFull} className="bg-red-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-red-700 transition">ELIMINAR TORNEO</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🚀 MODAL DE RESULTADO MANUAL CON AUTOCOMPLETADO ARREGLADO */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-[30px] w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-6 uppercase tracking-tighter">
              Añadir Resultado {manualMatch.type === 'bracket' ? 'de Llave' : ''}
            </h2>
            <div className="space-y-5">
              
              {/* LÓGICA DE AUTOCOMPLETADO DEPENDIENDO SI ES GRUPO O LLAVE */}
              {manualMatch.type === 'bracket' ? (
                <select className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold bg-white outline-none focus:border-black" onChange={e => {
                  const match = bracketMatches.find(bm => bm.id === e.target.value);
                  setManualMatch({...manualMatch, groupName: match.id, winnerName: match.player1, loserName: match.player2});
                }}>
                   <option value="">Selecciona el Partido...</option>
                   {bracketMatches.filter(bm => bm.status !== 'approved').map(bm => <option key={bm.id} value={bm.id}>{bm.round}: {bm.player1} vs {bm.player2}</option>)}
                </select>
              ) : (
                <>
                  <select className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold bg-white outline-none focus:border-black" value={manualMatch.groupName} onChange={e => setManualMatch({...manualMatch, groupName: e.target.value, winnerName: '', loserName: ''})}>
                     <option value="">Selecciona el Grupo...</option>
                     {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {/* AUTOCOMPLETADO: Solo aparecen si hay un grupo seleccionado */}
                  {manualMatch.groupName && (
                    <>
                      <select className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold bg-white outline-none focus:border-black" value={manualMatch.winnerName} onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})}>
                         <option value="">Selecciona al Ganador...</option>
                         {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                      
                      <select className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold bg-white outline-none focus:border-black" value={manualMatch.loserName} onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}>
                         <option value="">Selecciona al Perdedor...</option>
                         {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                      </select>
                    </>
                  )}
                </>
              )}
              
              <input type="text" placeholder="Score (ej: 6-4 6-2 o WO)" className="w-full p-4 border-2 border-slate-200 rounded-2xl font-black text-xl outline-none focus:border-black" value={manualMatch.score} onChange={e => setManualMatch({...manualMatch, score: e.target.value})} />
            </div>
            
            <div className="flex gap-4 mt-8">
              <button onClick={() => { setIsManualModalOpen(false); setManualMatch({...manualMatch, type: 'group'}); }} className="flex-1 p-4 border-2 border-slate-200 rounded-2xl font-bold hover:bg-slate-50">Cancelar</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-4 bg-black text-white rounded-2xl font-black shadow-lg">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}