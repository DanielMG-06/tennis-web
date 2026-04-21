"use client";

import React, { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase'; 
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc, addDoc 
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
  const [manualMatch, setManualMatch] = useState({ winnerName: '', loserName: '', groupName: '', type: 'group' });

  // ESTADOS PARA LAS CASILLAS DE RESULTADOS (Como en la App)
  const [sets, setSets] = useState({ s1w: '', s1l: '', s2w: '', s2l: '', s3w: '', s3l: '' });
  const [hasThirdSet, setHasThirdSet] = useState(false);
  const [isWO, setIsWO] = useState(false);

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: -2 });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
          setIsAdmin(adminDoc.exists());
        } catch(e) { setIsAdmin(false); }
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
    setGroups({ "Grupo A": [], "Grupo B": [] });
    
    const loadConfig = async () => {
      const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      if (gDoc.exists() && gDoc.data().structure) setGroups(gDoc.data().structure);
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email.trim(), password); } 
    catch (err) { alert("Error de acceso. Revisa tus credenciales."); }
  };

  const handleCreateTournament = async () => {
    if (!newT.name || !newT.price) return alert("Faltan datos");
    await addDoc(collection(db, "tournaments"), { ...newT, participantsIds: [], createdAt: serverTimestamp() });
    setIsModalOpen(false);
    setNewT({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Inscripciones' });
  };

  const handleDeleteFullTournament = async () => {
    if (prompt("Escribe 'ELIMINAR' para confirmar:") !== 'ELIMINAR') return;
    const matches = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
    await Promise.all(matches.docs.map(d => deleteDoc(d.ref)));
    const brackets = await getDocs(collection(db, "tournaments", activeTournament.id, "bracket_matches"));
    await Promise.all(brackets.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
    await deleteDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
    await deleteDoc(doc(db, "tournaments", activeTournament.id));
    setView('main'); setActiveTournament(null);
  };

  const handleGenerateFixture = async () => {
    if (!confirm("Se crearán los partidos y se activará el torneo. ¿Seguro?")) return;
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
  };

  const handleGenerateBrackets = async () => {
    if (!confirm("Esto cierra grupos y crea Semifinales. ¿Seguro?")) return;
    const standingsA = calculateStandings("Grupo A");
    const standingsB = calculateStandings("Grupo B");
    if (standingsA.length < 2 || standingsB.length < 2) return alert("Faltan jugadores para las llaves.");
    
    const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
    await addDoc(bracketRef, { round: 'Semifinal 1', player1: standingsA[0].name, player2: standingsB[1].name, winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp() });
    await addDoc(bracketRef, { round: 'Semifinal 2', player1: standingsB[0].name, player2: standingsA[1].name, winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp() });

    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Fase Final' });
    setActiveTournament({...activeTournament, status: 'Fase Final'});
  };

  const calculateStandings = (groupName: string) => {
    const players = groups[groupName] || [];
    let stats: any = {};
    players.forEach((p: any) => { stats[p.name] = { name: p.name, PJ: 0, PG: 0, PP: 0, Pts: 0, GW: 0, GL: 0 }; });

    const validMatches = reportedMatches.filter(m => m.groupName === groupName);
    
    validMatches.forEach(m => {
      let isPastDeadline = false;
      try {
        if (m.endDate && new Date() > new Date(m.endDate)) isPastDeadline = true;
      } catch(e){}

      const isEffectivelyApproved = m.status === 'approved' || (m.status === 'rival_pending' && isPastDeadline);

      if (isEffectivelyApproved) {
        const isWO = String(m.score).toUpperCase() === 'WO';
        const winner = stats[m.winnerName]; 
        const loser = stats[m.loserName];

        if(winner) { winner.PJ++; winner.PG++; winner.Pts += isWO ? scoringRules.winWO : scoringRules.win; if(isWO) winner.GW += 12; }
        if(loser) { loser.PJ++; loser.PP++; loser.Pts += isWO ? scoringRules.lossWO : scoringRules.loss; if(isWO) loser.GL += 12; }

        if(!isWO && winner && loser && m.score) {
          const mSets = String(m.score).trim().split(' ');
          mSets.forEach((set: string) => {
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
      }
    });

    return Object.values(stats).map((s: any) => {
      const totalGames = s.GW + s.GL; s.pctGames = totalGames === 0 ? 0 : (s.GW / totalGames) * 100; return s;
    }).sort((a: any, b: any) => b.Pts !== a.Pts ? b.Pts - a.Pts : b.pctGames - a.pctGames);
  };

  // =========================================================================
  // LÓGICA DEL NUEVO MODAL (SOLO NÚMEROS Y AUTO-FOCUS)
  // =========================================================================
  const handleSetChange = (field: string, value: string, nextFieldId: string | null) => {
    // Filtramos para que solo acepte números (0-9) y máximo 2 caracteres
    const numericValue = value.replace(/\D/g, '').slice(0, 2);
    setSets(prev => ({ ...prev, [field]: numericValue }));
    
    // Si escriben 2 dígitos, salta automático a la siguiente casilla
    if (numericValue.length === 2 && nextFieldId) {
      document.getElementById(nextFieldId)?.focus();
    }
  };

  const handleAddManualMatch = async () => {
    if (!manualMatch.groupName || !manualMatch.winnerName || !manualMatch.loserName) {
      return alert("Completa Grupo, Ganador y Perdedor.");
    }
    if (manualMatch.winnerName === manualMatch.loserName) {
      return alert("El ganador y perdedor no pueden ser la misma persona.");
    }

    let finalScore = "WO";

    if (!isWO) {
      if (!sets.s1w || !sets.s1l || !sets.s2w || !sets.s2l) {
        return alert("Por favor completa los dos primeros sets, o marca Victoria por W.O.");
      }
      finalScore = `${sets.s1w}-${sets.s1l} ${sets.s2w}-${sets.s2l}`;
      if (hasThirdSet && sets.s3w && sets.s3l) {
        finalScore += ` ${sets.s3w}-${sets.s3l}`;
      }
    }

    try {
      if (manualMatch.type === 'group') {
        await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { 
          groupName: manualMatch.groupName,
          winnerName: manualMatch.winnerName,
          loserName: manualMatch.loserName,
          player1: manualMatch.winnerName, 
          player2: manualMatch.loserName, 
          score: finalScore,
          status: 'approved', // El admin aprueba automáticamente
          createdAt: serverTimestamp() 
        });
      } else {
        await updateDoc(doc(db, "tournaments", activeTournament.id, "bracket_matches", manualMatch.groupName), { 
          winnerName: manualMatch.winnerName, 
          loserName: manualMatch.loserName, 
          score: finalScore, 
          status: 'approved' 
        });
      }
      
      setIsManualModalOpen(false);
      resetModal();
    } catch (e) {
      alert("Error al guardar el resultado.");
    }
  };

  const resetModal = () => {
    setManualMatch({ winnerName: '', loserName: '', groupName: '', type: 'group' });
    setSets({ s1w: '', s1l: '', s2w: '', s2l: '', s3w: '', s3l: '' });
    setHasThirdSet(false);
    setIsWO(false);
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="font-bold text-slate-400 uppercase tracking-widest animate-pulse">Cargando...</p></div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={handleLogin} className="bg-white p-10 rounded-[30px] shadow-2xl w-full max-w-sm">
        <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tighter">Panel Admin</h1>
        <input type="email" required placeholder="Correo" className="w-full p-4 mb-4 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-black" onChange={e => setEmail(e.target.value)} />
        <input type="password" required placeholder="Contraseña" className="w-full p-4 mb-8 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-black" onChange={e => setPassword(e.target.value)} />
        <button type="submit" className="w-full bg-black text-white p-4 rounded-2xl font-black shadow-lg hover:bg-slate-800">ENTRAR</button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      
      {view === 'main' ? (
        <div className="p-10 max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-12 border-b-2 border-slate-200 pb-6">
            <div>
              <h1 className="text-4xl font-black tracking-tighter uppercase">Gestión de Torneos</h1>
              <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Panel Principal</p>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-8 py-4 rounded-full font-black shadow-lg hover:bg-purple-700 transition">+ NUEVO TORNEO</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tournaments.map(t => (
              <div key={t.id} className="bg-white p-8 rounded-[30px] border-2 border-slate-100 shadow-sm hover:shadow-xl transition">
                <h2 className="text-2xl font-black mb-2">{t.name}</h2>
                <div className="flex gap-2 mb-8 mt-4">
                  <span className="text-xs font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase">{t.category}</span>
                  <span className={`text-xs font-black px-3 py-1 rounded-full uppercase ${t.status === 'Inscripciones' ? 'bg-blue-100 text-blue-700' : t.status === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{t.status}</span>
                </div>
                <button onClick={() => { setActiveTournament(t); setStep('groups'); setView('manage'); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-black">ADMINISTRAR</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <button onClick={() => setView('main')} className="bg-white border-2 h-12 w-12 flex items-center justify-center rounded-full shadow-sm hover:bg-slate-100 font-black">&larr;</button>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">{activeTournament.name}</h2>
            <span className="text-xs font-black text-slate-500 bg-slate-200 px-4 py-2 rounded-full uppercase">{activeTournament.status}</span>
            <div className="ml-auto flex gap-3">
              {activeTournament.status === 'Inscripciones' && <button onClick={handleGenerateFixture} className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:bg-purple-700">GENERAR FIXTURE Y ACTIVAR &rarr;</button>}
              {activeTournament.status === 'Activo' && <button onClick={handleGenerateBrackets} className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:bg-purple-700">TERMINAR GRUPOS Y CREAR LLAVES &rarr;</button>}
            </div>
          </div>
          
          <div className="bg-white rounded-[40px] shadow-2xl border-2 border-slate-100 overflow-hidden">
            <div className="flex flex-wrap bg-white px-6 pt-6 gap-2 border-b-2 border-slate-100">
               {['groups', 'standings', 'history', 'brackets', 'rules', 'settings'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-8 py-4 rounded-t-3xl text-xs font-black uppercase transition ${step === s ? 'bg-white shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.05)] text-slate-900 border-t-2 border-x-2 border-slate-100' : 'text-slate-400 hover:bg-slate-50'}`}>
                    {s === 'groups' ? 'Grupos' : s === 'standings' ? 'Posiciones' : s === 'history' ? 'Resultados' : s === 'brackets' ? 'Llaves' : s === 'rules' ? 'Reglas' : 'Ajustes'}
                 </button>
               ))}
            </div>

            <div className="p-10 bg-slate-50 min-h-[600px]">
              
              {/* TAB: GRUPOS */}
              {step === 'groups' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                  <div className="lg:col-span-4 lg:border-r-2 border-slate-200 lg:pr-10">
                    <h3 className="font-black text-sm uppercase mb-6 text-slate-400">Base de Jugadores</h3>
                    <input type="text" placeholder="Buscar jugador..." className="w-full p-4 border-2 border-slate-200 rounded-2xl mb-6 font-bold outline-none focus:border-black" onChange={e => setSearch(e.target.value)} />
                    <div className="space-y-3 max-h-[500px] overflow-y-auto">
                      {appPlayers.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())).map(p => (
                        <div key={p.id} className="p-4 bg-white rounded-2xl border-2 flex justify-between items-center shadow-sm">
                          <span className="font-bold text-sm">{p.name}</span>
                          <div className="flex gap-2">
                            <button onClick={() => setGroups({...groups, "Grupo A": [...(groups["Grupo A"]||[]), p]})} className="bg-slate-50 border-2 px-3 py-1 rounded-xl text-xs font-black hover:bg-black hover:text-white">+A</button>
                            <button onClick={() => setGroups({...groups, "Grupo B": [...(groups["Grupo B"]||[]), p]})} className="bg-slate-50 border-2 px-3 py-1 rounded-xl text-xs font-black hover:bg-black hover:text-white">+B</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="lg:col-span-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {Object.keys(groups).map(g => (
                        <div key={g} className="bg-white p-8 rounded-[30px] border-2 shadow-sm">
                          <h4 className="font-black uppercase text-xl mb-6">{g}</h4>
                          <div className="space-y-3">
                            {groups[g].length === 0 && <p className="text-slate-400 font-bold text-sm">Grupo vacío</p>}
                            {groups[g].map((p: any) => (
                              <div key={p.id} className="bg-slate-50 p-4 rounded-xl border-2 text-sm font-bold flex justify-between items-center">
                                {p.name}
                                <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-slate-400 hover:text-red-500 h-8 w-8 rounded-lg flex items-center justify-center">&times;</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups}); alert("Grupos guardados."); }} className="mt-10 w-full bg-black text-white p-5 rounded-2xl font-black shadow-xl hover:bg-slate-800">GUARDAR GRUPOS</button>
                  </div>
                </div>
              )}

              {/* TAB: REGLAS */}
              {step === 'rules' && (
                <div className="max-w-4xl mx-auto py-4">
                  <div className="grid grid-cols-2 gap-8 mb-12">
                    <div className="bg-white p-8 rounded-[30px] border-2 shadow-sm"><label className="block text-xs font-black text-slate-400 mb-4 uppercase">Puntos Victoria</label><input type="number" value={scoringRules.win} onChange={e => setScoringRules({...scoringRules, win: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 rounded-2xl bg-slate-50 focus:border-black outline-none text-green-600" /></div>
                    <div className="bg-white p-8 rounded-[30px] border-2 shadow-sm"><label className="block text-xs font-black text-slate-400 mb-4 uppercase">Puntos Derrota</label><input type="number" value={scoringRules.loss} onChange={e => setScoringRules({...scoringRules, loss: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 rounded-2xl bg-slate-50 focus:border-black outline-none text-slate-700" /></div>
                    <div className="bg-green-50 p-8 rounded-[30px] border-2 border-green-100"><label className="block text-xs font-black text-green-700 mb-4 uppercase">Victoria W.O.</label><input type="number" value={scoringRules.winWO} onChange={e => setScoringRules({...scoringRules, winWO: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 border-green-200 rounded-2xl bg-white focus:border-green-500 outline-none text-green-700" /></div>
                    <div className="bg-red-50 p-8 rounded-[30px] border-2 border-red-100"><label className="block text-xs font-black text-red-700 mb-4 uppercase">Derrota W.O.</label><input type="number" value={scoringRules.lossWO} onChange={e => setScoringRules({...scoringRules, lossWO: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 border-red-200 rounded-2xl bg-white focus:border-red-500 outline-none text-red-600" /></div>
                  </div>
                  <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true }); alert("Reglas guardadas."); }} className="w-full bg-black text-white p-6 rounded-2xl font-black shadow-xl hover:bg-slate-800">GUARDAR REGLAS Y RECALCULAR</button>
                </div>
              )}

              {/* TAB: RESULTADOS */}
              {step === 'history' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex justify-between items-center mb-10">
                    <h3 className="font-black uppercase text-slate-400 text-sm">Monitor de Partidos</h3>
                    <button onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'group'}); setIsManualModalOpen(true); }} className="bg-black text-white px-8 py-4 rounded-full font-black shadow-lg hover:bg-slate-800">+ RESULTADO DE GRUPO</button>
                  </div>
                  <div className="space-y-4">
                    {reportedMatches.filter(m => m.status === 'approved' || m.status === 'rival_pending' || m.status === 'rejected').map(m => (
                      <div key={m.id} className={`p-6 bg-white border-2 shadow-sm rounded-3xl flex justify-between items-center ${m.status === 'rejected' ? 'border-red-400' : 'border-slate-100'}`}>
                        <div className="flex items-center">
                          <span className="text-xs font-black bg-slate-100 text-slate-600 px-4 py-2 rounded-full uppercase mr-6">{m.groupName}</span>
                          <span className="font-black text-xl text-slate-800">{m.winnerName} <span className="text-slate-300 mx-3 text-sm">vs</span> {m.loserName}</span>
                        </div>
                        <div className="flex items-center gap-8">
                          <span className="font-black text-3xl">{m.score}</span>
                          {m.status === 'rival_pending' && <span className="text-xs font-bold text-orange-500 bg-orange-50 px-3 py-1 rounded-lg">En Revisión</span>}
                          {m.status === 'rejected' && <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id), {status: 'approved'})} className="bg-red-600 text-white font-bold text-xs px-4 py-2 rounded-xl">Forzar Aprobación (Disputa)</button>}
                          <button onClick={() => deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id))} className="text-red-500 bg-red-50 p-3 rounded-xl hover:bg-red-500 hover:text-white transition"><IconTrash /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: POSICIONES */}
              {step === 'standings' && (
                <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-10">
                  {Object.keys(groups).map((gName) => {
                      const standings = calculateStandings(gName); 
                      return (
                          <div key={gName} className="bg-white border-2 shadow-lg rounded-[30px] overflow-hidden">
                              <div className="bg-slate-900 p-6"><h4 className="font-black text-white text-xl uppercase">{gName}</h4></div>
                              <table className="w-full text-left">
                                  <thead className="bg-slate-50 text-slate-400 text-xs font-black uppercase border-b-2">
                                      <tr><th className="p-6">Jugador</th><th className="p-6 text-center">PJ</th><th className="p-6 text-center">PG</th><th className="p-6 text-center">PTS</th></tr>
                                  </thead>
                                  <tbody>
                                      {standings.map((s: any, i: number) => (
                                          <tr key={s.name} className="border-b border-slate-50">
                                            <td className="p-6 font-black text-slate-700"><span className="text-slate-300 mr-4">{i+1}</span>{s.name}</td>
                                            <td className="p-6 text-center font-bold text-slate-500">{s.PJ}</td>
                                            <td className="p-6 text-center font-bold text-slate-500">{s.PG}</td>
                                            <td className="p-6 text-center font-black text-2xl text-green-600">{s.Pts}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      );
                  })}
                </div>
              )}

              {/* TAB: LLAVES */}
              {step === 'brackets' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex justify-between items-center mb-10">
                    <h3 className="font-black uppercase text-slate-400 text-sm">Fase Final</h3>
                    <button onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'bracket'}); setIsManualModalOpen(true); }} className="bg-purple-600 text-white px-8 py-4 rounded-full font-black shadow-lg">+ RESULTADO DE LLAVE</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {bracketMatches.map(bm => (
                      <div key={bm.id} className="border-2 rounded-[30px] p-8 bg-white shadow-sm">
                        <h4 className="font-black text-purple-600 text-sm uppercase mb-6">{bm.round}</h4>
                        <div className={`p-5 rounded-2xl border-2 mb-4 font-bold flex justify-between ${bm.winnerName === bm.player1 ? 'border-green-400 bg-green-50' : 'bg-slate-50'}`}>
                          <span>{bm.player1}</span> {bm.winnerName === bm.player1 && <span>🏆</span>}
                        </div>
                        <div className={`p-5 rounded-2xl border-2 font-bold flex justify-between ${bm.winnerName === bm.player2 ? 'border-green-400 bg-green-50' : 'bg-slate-50'}`}>
                          <span>{bm.player2}</span> {bm.winnerName === bm.player2 && <span>🏆</span>}
                        </div>
                        <div className="mt-6 text-center font-black text-3xl">{bm.status === 'approved' ? bm.score : '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* TAB: AJUSTES */}
              {step === 'settings' && (
                <div className="py-20 flex justify-center">
                  <div className="w-full max-w-lg p-12 bg-white border-4 border-red-100 border-dashed rounded-[40px] text-center shadow-sm">
                    <h3 className="text-3xl font-black mb-4">Zona Restringida</h3>
                    <p className="text-slate-500 font-bold mb-10">Eliminará el torneo, partidos, llaves y configuración de forma permanente.</p>
                    <button onClick={handleDeleteFullTournament} className="w-full bg-red-600 text-white p-5 rounded-2xl font-black shadow-xl">ELIMINAR TORNEO</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE RESULTADOS MANUAL (ESTILO APP CON CASILLAS AUTOMÁTICAS)
          ========================================================================= */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 md:p-10 rounded-[40px] w-full max-w-lg shadow-2xl">
            <h2 className="text-3xl font-black mb-8 text-center text-slate-900">
              {manualMatch.type === 'bracket' ? 'RESULTADO DE LLAVE' : 'RESULTADO DE GRUPO'}
            </h2>
            
            <div className="space-y-6">
              
              {/* SELECTORES DE PARTIDO / JUGADORES */}
              {manualMatch.type === 'bracket' ? (
                <select className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold bg-slate-50 outline-none" onChange={e => {
                  const match = bracketMatches.find(bm => bm.id === e.target.value);
                  if(match) setManualMatch({...manualMatch, groupName: match.id, winnerName: match.player1, loserName: match.player2});
                }}>
                   <option value="">Selecciona la Llave Pendiente...</option>
                   {bracketMatches.filter(bm => bm.status !== 'approved').map(bm => <option key={bm.id} value={bm.id}>{bm.round}: {bm.player1} vs {bm.player2}</option>)}
                </select>
              ) : (
                <>
                  <select className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold bg-slate-50 outline-none" value={manualMatch.groupName} onChange={e => { resetModal(); setManualMatch({...manualMatch, type: 'group', groupName: e.target.value}); }}>
                     <option value="">Selecciona el Grupo...</option>
                     {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {manualMatch.groupName && (
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-3xl border-2 border-slate-100">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 mb-2 text-center uppercase">Ganador</label>
                        <select className="w-full p-4 border-2 border-green-300 rounded-2xl font-bold bg-white text-green-700 outline-none" value={manualMatch.winnerName} onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})}>
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 mb-2 text-center uppercase">Perdedor</label>
                        <select className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold bg-white outline-none" value={manualMatch.loserName} onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}>
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* TOGGLE W.O. */}
              <div className="flex items-center justify-between p-4 bg-orange-50 border-2 border-orange-100 rounded-2xl">
                <span className="font-black text-orange-700">Victoria por W.O.</span>
                <input type="checkbox" checked={isWO} onChange={e => setIsWO(e.target.checked)} className="w-6 h-6 accent-orange-600" />
              </div>

              {/* CASILLAS NUMÉRICAS (Ocultas si es W.O.) */}
              {!isWO && (
                <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 text-center uppercase mb-4">Score Exacto (Solo Números)</p>
                  
                  {/* SET 1 */}
                  <div className="flex items-center justify-center gap-4 mb-4">
                    <span className="font-black text-slate-400 w-12 text-right text-xs">SET 1</span>
                    <input id="s1w" value={sets.s1w} onChange={e => handleSetChange('s1w', e.target.value, 's1l')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500" />
                    <span className="font-black text-slate-300">-</span>
                    <input id="s1l" value={sets.s1l} onChange={e => handleSetChange('s1l', e.target.value, 's2w')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500" />
                  </div>
                  
                  {/* SET 2 */}
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <span className="font-black text-slate-400 w-12 text-right text-xs">SET 2</span>
                    <input id="s2w" value={sets.s2w} onChange={e => handleSetChange('s2w', e.target.value, 's2l')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500" />
                    <span className="font-black text-slate-300">-</span>
                    <input id="s2l" value={sets.s2l} onChange={e => handleSetChange('s2l', e.target.value, hasThirdSet ? 's3w' : null)} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500" />
                  </div>

                  {/* TOGGLE 3ER SET */}
                  <div className="flex items-center justify-between mb-4 border-t-2 pt-4">
                    <span className="font-bold text-slate-500 text-sm">Super Tie-break (3er Set)</span>
                    <input type="checkbox" checked={hasThirdSet} onChange={e => { setHasThirdSet(e.target.checked); if(e.target.checked) setTimeout(()=>document.getElementById('s3w')?.focus(), 100); }} className="w-5 h-5 accent-green-600" />
                  </div>

                  {/* SET 3 */}
                  {hasThirdSet && (
                    <div className="flex items-center justify-center gap-4">
                      <span className="font-black text-slate-400 w-12 text-right text-xs">SET 3</span>
                      <input id="s3w" value={sets.s3w} onChange={e => handleSetChange('s3w', e.target.value, 's3l')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500" />
                      <span className="font-black text-slate-300">-</span>
                      <input id="s3l" value={sets.s3l} onChange={e => handleSetChange('s3l', e.target.value, null)} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500" />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsManualModalOpen(false)} className="flex-1 p-5 border-2 rounded-2xl font-black text-slate-500 hover:bg-slate-50">CANCELAR</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-5 bg-black text-white rounded-2xl font-black shadow-lg">GUARDAR RESULTADO</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para Crear Torneo */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-10 rounded-[40px] w-full max-w-md shadow-2xl">
            <h2 className="text-3xl font-black mb-8 text-center uppercase">Nuevo Torneo</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Nombre del Torneo" className="w-full p-4 border-2 rounded-2xl font-bold" onChange={e => setNewT({...newT, name: e.target.value})} />
              <input type="number" placeholder="Precio (S/)" className="w-full p-4 border-2 rounded-2xl font-bold" onChange={e => setNewT({...newT, price: e.target.value})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-4 border-2 rounded-2xl font-bold">Cancelar</button>
              <button onClick={handleCreateTournament} className="flex-1 p-4 bg-purple-600 text-white rounded-2xl font-black">CREAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Pequeño componente de icono para el botón de borrar
function IconTrash() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}