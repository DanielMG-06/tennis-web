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
  const [bracketMatches, setBracketMatches] = useState<any[]>([]); // NUEVO: Para las llaves
  
  const [newT, setNewT] = useState({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Inscripciones' });
  const [editT, setEditT] = useState<any>({}); 
  const [manualMatch, setManualMatch] = useState({ winnerName: '', loserName: '', score: '', groupName: '', type: 'group' });

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
    
    const loadConfig = async () => {
      const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      if (gDoc.exists()) setGroups(gDoc.data().structure || { "Grupo A": [], "Grupo B": [] });
      const rDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
      if (rDoc.exists() && rDoc.data().win !== undefined) setScoringRules(rDoc.data() as any);
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

  // 🔥 NUEVO: Generar Fixture de Grupos (Todos contra todos)
  const handleGenerateFixture = async () => {
    if (!confirm("Esto creará partidos 'Pendientes' para todos los jugadores de cada grupo. ¿Continuar?")) return;
    
    const matchesRef = collection(db, "tournaments", activeTournament.id, "matches");
    let matchCount = 0;

    for (const groupName of Object.keys(groups)) {
      const players = groups[groupName];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          await addDoc(matchesRef, {
            groupName: groupName,
            player1: players[i].name, // Guardamos p1 y p2 porque aún no hay ganador
            player2: players[j].name,
            winnerName: '',
            loserName: '',
            score: '',
            status: 'pending',
            createdAt: serverTimestamp()
          });
          matchCount++;
        }
      }
    }
    alert(`¡Fixture generado! Se crearon ${matchCount} partidos pendientes.`);
    // Cambiamos el estado a "Activo" para que se juegue
    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Activo' });
    setActiveTournament({...activeTournament, status: 'Activo'});
  };

  // 🔥 NUEVO: Generar Llaves (Semifinales Automáticas)
  const handleGenerateBrackets = async () => {
    if (!confirm("Esto dará por terminada la fase de grupos y creará las Semifinales. ¿Seguro?")) return;
    
    const standingsA = calculateStandings("Grupo A");
    const standingsB = calculateStandings("Grupo B");

    if (standingsA.length < 2 || standingsB.length < 2) {
      return alert("Necesitas al menos 2 jugadores por grupo para hacer Semifinales.");
    }

    const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
    
    // Semifinal 1: 1A vs 2B
    await addDoc(bracketRef, {
      round: 'Semifinal 1',
      player1: standingsA[0].name,
      player2: standingsB[1].name,
      winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp()
    });

    // Semifinal 2: 1B vs 2A
    await addDoc(bracketRef, {
      round: 'Semifinal 2',
      player1: standingsB[0].name,
      player2: standingsA[1].name,
      winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Fase Final' });
    setActiveTournament({...activeTournament, status: 'Fase Final'});
    alert("¡Semifinales Generadas con éxito!");
  };

  const handleAddManualMatch = async () => {
    if (manualMatch.type === 'group') {
      await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { ...manualMatch, player1: manualMatch.winnerName, player2: manualMatch.loserName, status: 'approved', createdAt: serverTimestamp() });
    } else {
      await updateDoc(doc(db, "tournaments", activeTournament.id, "bracket_matches", manualMatch.groupName), { 
        winnerName: manualMatch.winnerName, 
        loserName: manualMatch.loserName, 
        score: manualMatch.score, 
        status: 'approved' 
      });
    }
    setIsManualModalOpen(false);
  };

  // CÁLCULO DE POSICIONES
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

  if (authLoading) return <div className="p-20 text-center font-bold">Cargando Sistema...</div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-sm">
        <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tighter">Acceso Admin</h1>
        <input type="email" placeholder="Email" className="w-full p-4 mb-4 border-2 rounded-lg font-bold" onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" className="w-full p-4 mb-6 border-2 rounded-lg font-bold" onChange={e => setPassword(e.target.value)} />
        <button onClick={() => signInWithEmailAndPassword(auth, email, password)} className="w-full bg-black text-white p-4 rounded-lg font-black">ENTRAR</button>
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
                  <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${t.status === 'Inscripciones' ? 'bg-blue-100 text-blue-700' : t.status === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{t.status}</span>
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
            <h2 className="text-2xl font-black uppercase tracking-tight">{activeTournament.name} <span className="text-sm font-bold text-slate-400 bg-slate-100 px-3 py-1 rounded-full ml-4">{activeTournament.status}</span></h2>
            
            {/* BOTÓN ESTADO TORNEO */}
            {activeTournament.status === 'Inscripciones' && (
              <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id), {status: 'Activo'})} className="ml-auto bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm">Cerrar Inscripciones &rarr;</button>
            )}
            {activeTournament.status === 'Activo' && (
              <button onClick={handleGenerateBrackets} className="ml-auto bg-purple-600 text-white px-4 py-2 rounded-lg font-bold text-sm">Terminar Grupos y Crear Llaves &rarr;</button>
            )}
            {activeTournament.status === 'Fase Final' && (
              <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id), {status: 'Completado'})} className="ml-auto bg-black text-white px-4 py-2 rounded-lg font-bold text-sm">Finalizar Torneo 🏆</button>
            )}
          </div>
          
          <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="flex bg-slate-50 p-2 gap-2 border-b">
               {['groups', 'standings', 'history', 'brackets', 'rules'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-6 py-2 rounded-full text-xs font-black uppercase transition ${step === s ? 'bg-white shadow-md text-black' : 'text-slate-400 hover:text-slate-600'}`}>
                    {s === 'brackets' ? 'Llaves' : s === 'rules' ? 'Reglas' : s === 'history' ? 'Resultados' : s === 'standings' ? 'Posiciones' : 'Grupos'}
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
                    <div className="col-span-2 mt-4 flex gap-4">
                      <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups}); alert("Grupos guardados"); }} className="flex-1 bg-black text-white p-4 rounded-2xl font-black shadow-lg hover:bg-slate-800">1. GUARDAR GRUPOS</button>
                      <button onClick={handleGenerateFixture} className="flex-1 bg-blue-600 text-white p-4 rounded-2xl font-black shadow-lg hover:bg-blue-700">2. GENERAR FIXTURE</button>
                    </div>
                  </div>
                </div>
              )}

              {step === 'brackets' && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black uppercase text-slate-400 text-xl">Fase Final</h3>
                    <button onClick={() => { setManualMatch({...manualMatch, type: 'bracket'}); setIsManualModalOpen(true); }} className="bg-purple-600 text-white px-6 py-2 rounded-full font-bold">+ Resultado Manual a Llave</button>
                  </div>
                  {bracketMatches.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed rounded-2xl">Aún no se han generado las llaves. Termina los grupos primero.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      {bracketMatches.map(bm => (
                        <div key={bm.id} className="border-2 rounded-2xl p-4 bg-slate-50">
                          <h4 className="font-black text-purple-700 text-xs uppercase mb-2">{bm.round}</h4>
                          <div className="bg-white p-3 rounded-lg border shadow-sm mb-2 font-bold flex justify-between">
                            <span>{bm.player1}</span> {bm.winnerName === bm.player1 && <span className="text-green-500">🏆</span>}
                          </div>
                          <div className="bg-white p-3 rounded-lg border shadow-sm font-bold flex justify-between">
                            <span>{bm.player2}</span> {bm.winnerName === bm.player2 && <span className="text-green-500">🏆</span>}
                          </div>
                          {bm.status === 'approved' ? (
                            <p className="mt-3 text-center font-black text-sm">{bm.score}</p>
                          ) : (
                            <p className="mt-3 text-center text-xs text-orange-500 font-bold">Pendiente</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 'history' && (
                <div>
                  <button onClick={() => setIsManualModalOpen(true)} className="bg-black text-white px-6 py-2 rounded-full font-bold mb-6">+ Resultado Manual de Grupo</button>
                  <div className="space-y-4">
                    {reportedMatches.filter(m => m.status === 'approved').map(m => (
                      <div key={m.id} className="p-4 bg-white border-2 rounded-2xl flex justify-between items-center">
                        <div>
                          <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-full uppercase mr-2">{m.groupName}</span>
                          <span className="font-bold">{m.winnerName} <span className="text-slate-400 mx-2">vs</span> {m.loserName}</span>
                        </div>
                        <span className="font-black text-xl">{m.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reglas y Standings mantienen el mismo codigo que antes... */}
            </div>
          </div>
        </div>
      )}

      {/* Modal Manual Dual (Sirve para Grupos y Llaves) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 rounded-3xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-6 uppercase tracking-tighter">
              Añadir Resultado {manualMatch.type === 'bracket' ? 'de Llave' : 'de Grupo'}
            </h2>
            <div className="space-y-4">
              {manualMatch.type === 'bracket' ? (
                <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => {
                  const match = bracketMatches.find(bm => bm.id === e.target.value);
                  setManualMatch({...manualMatch, groupName: match.id, winnerName: match.player1, loserName: match.player2});
                }}>
                   <option>Selecciona el Partido de la Llave...</option>
                   {bracketMatches.filter(bm => bm.status !== 'approved').map(bm => <option key={bm.id} value={bm.id}>{bm.round}: {bm.player1} vs {bm.player2}</option>)}
                </select>
              ) : (
                <select className="w-full p-4 border-2 rounded-xl font-bold bg-slate-50" onChange={e => setManualMatch({...manualMatch, groupName: e.target.value})}>
                   <option>Elegir Grupo...</option>
                   {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              
              {/* Resto de inputs iguales... */}
              <input type="text" placeholder="Ganador" className="w-full p-4 border-2 rounded-xl font-bold" value={manualMatch.winnerName} onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})} />
              <input type="text" placeholder="Perdedor" className="w-full p-4 border-2 rounded-xl font-bold" value={manualMatch.loserName} onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})} />
              <input type="text" placeholder="Score (ej: 6-4 6-2)" className="w-full p-4 border-2 rounded-xl font-bold" onChange={e => setManualMatch({...manualMatch, score: e.target.value})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => { setIsManualModalOpen(false); setManualMatch({...manualMatch, type: 'group'}); }} className="flex-1 p-4 border-2 rounded-xl font-bold">Cancelar</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-4 bg-black text-white rounded-xl font-black">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}