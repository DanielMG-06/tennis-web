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

  const [sets, setSets] = useState({ s1w: '', s1l: '', s2w: '', s2l: '', s3w: '', s3l: '' });
  const [hasThirdSet, setHasThirdSet] = useState(false);
  const [isWO, setIsWO] = useState(false);

  const [search, setSearch] = useState('');
  const [guestName, setGuestName] = useState(''); 
  
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [editingGroup, setEditingGroup] = useState<string | null>(null);

  // NUEVO: Añadido "advancingPerGroup" para decidir cuántos pasan
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: -2, advancingPerGroup: 2 });

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
    
    const loadConfig = async () => {
      const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      if (gDoc.exists() && gDoc.data().structure) {
        setGroups(gDoc.data().structure);
      } else {
        setGroups({ "Grupo A": [], "Grupo B": [] });
      }
      const rDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
      if (rDoc.exists() && rDoc.data().win !== undefined) {
        setScoringRules({ advancingPerGroup: 2, ...rDoc.data() } as any); // Default fallback
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

  const handleAddGuest = async () => {
    if (!guestName.trim()) return alert("Escribe el nombre del invitado");
    const newGuest = { name: `${guestName.trim()} (Invitado)`, isGuest: true, createdAt: serverTimestamp() };
    try {
      const docRef = await addDoc(collection(db, "players"), newGuest);
      setAppPlayers([{ id: docRef.id, ...newGuest }, ...appPlayers]);
      setGuestName('');
    } catch (e) { alert("Error al crear invitado"); }
  };

  const handleDeleteGuest = async (guestId: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return;
    try {
      await deleteDoc(doc(db, "players", guestId));
      setAppPlayers(appPlayers.filter(p => p.id !== guestId));
    } catch (e) { alert("Error al eliminar invitado"); }
  };

  const handleAddGroup = () => {
    const groupCount = Object.keys(groups).length;
    const newGroupName = `Grupo ${String.fromCharCode(65 + groupCount)}`; 
    if (!groups[newGroupName]) setGroups({ ...groups, [newGroupName]: [] });
    else setGroups({ ...groups, [`Nuevo Grupo ${groupCount + 1}`]: [] });
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
    setEditingGroup(null);
    const cleanName = newName.trim();
    if (!cleanName || cleanName === oldName || groups[cleanName]) return;
    const newGroups = { ...groups };
    newGroups[cleanName] = newGroups[oldName];
    delete newGroups[oldName];
    setGroups(newGroups);
  };

  const handleDeleteGroup = (gName: string) => {
    if (groups[gName].length > 0) if (!confirm(`El ${gName} tiene jugadores. ¿Eliminar de todas formas?`)) return;
    const newGroups = { ...groups };
    delete newGroups[gName];
    setGroups(newGroups);
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

  // =========================================================================
  // NUEVO: GENERACIÓN INTELIGENTE DE LLAVES SEGÚN CANTIDAD ELEGIDA
  // =========================================================================
  const handleGenerateBrackets = async () => {
    const advanceCount = scoringRules.advancingPerGroup || 2;
    if (!confirm(`Se cerrarán los grupos. Pasarán los ${advanceCount} mejores de cada grupo. ¿Continuar?`)) return;
    
    let qualifiedPlayers: any[] = [];
    
    // Recolectar los mejores N de cada grupo
    Object.keys(groups).forEach(gName => {
      const standings = calculateStandings(gName);
      qualifiedPlayers.push(...standings.slice(0, advanceCount));
    });

    if (qualifiedPlayers.length < 2) return alert("No hay suficientes clasificados para crear llaves.");

    // Ordenar a todos los clasificados del mejor al peor globalmente para cruces justos
    qualifiedPlayers.sort((a, b) => b.Pts !== a.Pts ? b.Pts - a.Pts : b.pctGames - a.pctGames);

    const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
    const numMatches = Math.floor(qualifiedPlayers.length / 2);
    
    // Asignar nombre de ronda dinámico
    let roundName = 'Fase Eliminatoria';
    if (numMatches === 8) roundName = 'Octavos de Final';
    if (numMatches === 4) roundName = 'Cuartos de Final';
    if (numMatches === 2) roundName = 'Semifinal';
    if (numMatches === 1) roundName = 'Gran Final';

    // Emparejar: El Mejor(1ro) vs El Peor(Último), Segundo vs Penúltimo, etc.
    for (let i = 0; i < numMatches; i++) {
      const p1 = qualifiedPlayers[i].name;
      const p2 = qualifiedPlayers[qualifiedPlayers.length - 1 - i].name;
      
      await addDoc(bracketRef, { 
        round: `${roundName} ${i+1}`, 
        player1: p1, 
        player2: p2, 
        winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp() 
      });
    }

    if (qualifiedPlayers.length % 2 !== 0) {
      alert(`Aviso: Pasaron ${qualifiedPlayers.length} jugadores (número impar). El jugador con menos puntos no fue emparejado.`);
    }

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
      try { if (m.endDate && new Date() > new Date(m.endDate)) isPastDeadline = true; } catch(e){}
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

  const handleSetChange = (field: string, value: string, nextFieldId: string | null) => {
    const numericValue = value.replace(/\D/g, '').slice(0, 2);
    setSets(prev => ({ ...prev, [field]: numericValue }));
    if (numericValue.length === 2 && nextFieldId) {
      document.getElementById(nextFieldId)?.focus();
    }
  };

  const handleAddManualMatch = async () => {
    if (!manualMatch.groupName || !manualMatch.winnerName || !manualMatch.loserName) return alert("Completa Grupo, Ganador y Perdedor.");
    if (manualMatch.winnerName === manualMatch.loserName) return alert("El ganador y perdedor no pueden ser la misma persona.");

    let finalScore = "WO";
    if (!isWO) {
      if (!sets.s1w || !sets.s1l || !sets.s2w || !sets.s2l) return alert("Completa los dos primeros sets.");
      finalScore = `${sets.s1w}-${sets.s1l} ${sets.s2w}-${sets.s2l}`;
      if (hasThirdSet && sets.s3w && sets.s3l) finalScore += ` ${sets.s3w}-${sets.s3l}`;
    }

    try {
      if (manualMatch.type === 'group') {
        await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { 
          groupName: manualMatch.groupName, winnerName: manualMatch.winnerName, loserName: manualMatch.loserName,
          player1: manualMatch.winnerName, player2: manualMatch.loserName, score: finalScore, status: 'approved', createdAt: serverTimestamp() 
        });
      } else {
        await updateDoc(doc(db, "tournaments", activeTournament.id, "bracket_matches", manualMatch.groupName), { 
          winnerName: manualMatch.winnerName, loserName: manualMatch.loserName, score: finalScore, status: 'approved' 
        });
      }
      setIsManualModalOpen(false); resetModal();
    } catch (e) { alert("Error al guardar el resultado."); }
  };

  const resetModal = () => {
    setManualMatch({ winnerName: '', loserName: '', groupName: '', type: 'group' });
    setSets({ s1w: '', s1l: '', s2w: '', s2l: '', s3w: '', s3l: '' });
    setHasThirdSet(false); setIsWO(false);
  };

  // =========================================================================
  // UI MINIMALISTA Y FLAT
  // =========================================================================
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p className="font-bold text-gray-400 uppercase tracking-widest">Cargando...</p></div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-10 border border-gray-200 w-full max-w-sm">
        <h1 className="text-xl font-bold text-center mb-8 uppercase tracking-widest">Acceso Admin</h1>
        <input type="email" required placeholder="Correo" className="w-full p-4 mb-4 border border-gray-300 font-bold outline-none focus:border-black" onChange={e => setEmail(e.target.value)} />
        <input type="password" required placeholder="Contraseña" className="w-full p-4 mb-8 border border-gray-300 font-bold outline-none focus:border-black" onChange={e => setPassword(e.target.value)} />
        <button type="submit" className="w-full bg-black text-white p-4 font-bold tracking-widest uppercase hover:bg-gray-800">ENTRAR</button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20">
      
      {view === 'main' ? (
        <div className="p-10 max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-10 border-b border-gray-300 pb-4">
            <h1 className="text-3xl font-bold tracking-tighter uppercase">Panel de Torneos</h1>
            <button onClick={() => setIsModalOpen(true)} className="bg-black text-white px-6 py-3 font-bold text-sm tracking-widest uppercase hover:bg-gray-800 transition">+ CREAR TORNEO</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map(t => (
              <div key={t.id} className="bg-white p-6 border border-gray-200 hover:border-black transition">
                <h2 className="text-xl font-bold mb-2 uppercase">{t.name}</h2>
                <div className="flex gap-2 mb-6 mt-2">
                  <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-1 uppercase">{t.category}</span>
                  <span className="text-xs font-bold border border-black text-black px-2 py-1 uppercase">{t.status}</span>
                </div>
                <button onClick={() => { setActiveTournament(t); setStep('groups'); setView('manage'); }} className="w-full bg-gray-100 text-black py-3 font-bold text-sm uppercase tracking-widest border border-transparent hover:border-black transition">GESTIONAR</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-8 border-b border-gray-300 pb-4">
            <button onClick={() => setView('main')} className="text-gray-500 hover:text-black font-bold text-xl px-2">&larr;</button>
            <h2 className="text-2xl font-bold uppercase tracking-tight">{activeTournament.name}</h2>
            <span className="text-xs font-bold border border-black px-2 py-1 uppercase ml-2">{activeTournament.status}</span>
            <div className="ml-auto flex gap-3">
              {activeTournament.status === 'Inscripciones' && <button onClick={handleGenerateFixture} className="bg-black text-white px-6 py-2 font-bold text-xs tracking-widest uppercase">GENERAR FIXTURE &rarr;</button>}
              {activeTournament.status === 'Activo' && <button onClick={handleGenerateBrackets} className="bg-black text-white px-6 py-2 font-bold text-xs tracking-widest uppercase">CREAR LLAVES &rarr;</button>}
            </div>
          </div>
          
          <div className="bg-white border border-gray-200 overflow-hidden">
            {/* TABS MINIMALISTAS */}
            <div className="flex bg-gray-50 border-b border-gray-200 overflow-x-auto">
               {['groups', 'standings', 'history', 'brackets', 'rules', 'settings'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-8 py-4 text-xs font-bold uppercase tracking-widest transition ${step === s ? 'bg-white border-t-2 border-black text-black' : 'text-gray-400 hover:text-black'}`}>
                    {s === 'groups' ? 'Grupos' : s === 'standings' ? 'Posiciones' : s === 'history' ? 'Resultados' : s === 'brackets' ? 'Llaves' : s === 'rules' ? 'Reglas' : 'Ajustes'}
                 </button>
               ))}
            </div>

            <div className="p-8 min-h-[600px]">
              
              {/* === GRUPOS === */}
              {step === 'groups' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-4 lg:border-r border-gray-200 lg:pr-8">
                    <div className="mb-8 p-6 bg-gray-50 border border-gray-200">
                      <h4 className="text-xs font-bold text-black uppercase mb-2 tracking-widest">Crear Invitado</h4>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Ej: Carlos Perez" className="w-full p-2 border border-gray-300 text-sm font-bold outline-none focus:border-black" value={guestName} onChange={e => setGuestName(e.target.value)} />
                        <button onClick={handleAddGuest} className="bg-black text-white px-4 font-bold">+</button>
                      </div>
                    </div>
                    <h3 className="font-bold text-xs uppercase mb-4 text-gray-500 tracking-widest">Base de Jugadores</h3>
                    <input type="text" placeholder="Buscar jugador..." className="w-full p-3 border border-gray-300 mb-4 font-bold outline-none focus:border-black text-sm" onChange={e => setSearch(e.target.value)} />
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {appPlayers.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())).map(p => (
                        <div key={p.id} className="p-3 border border-gray-200 bg-white flex flex-col">
                          <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-xs text-black">{p.name}</span>
                            {p.isGuest && <button onClick={() => handleDeleteGuest(p.id, p.name)} className="text-gray-400 hover:text-red-500 text-xs font-bold">Borrar</button>}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3 border-t border-gray-100 pt-2">
                            {Object.keys(groups).map(gName => (
                              <button key={gName} onClick={() => setGroups({...groups, [gName]: [...(groups[gName]||[]), p]})} className="bg-gray-100 border border-gray-200 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-black hover:text-white uppercase">
                                + {gName.substring(0, 8)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="lg:col-span-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {Object.keys(groups).map(g => (
                        <div key={g} className="bg-white p-6 border border-gray-200 group">
                          <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                            {editingGroup === g ? (
                              <input autoFocus defaultValue={g} onBlur={(e) => handleRenameGroup(g, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameGroup(g, e.currentTarget.value)} className="font-bold uppercase text-lg border-b border-black outline-none w-3/4" />
                            ) : (
                              <h4 className="font-bold uppercase text-lg cursor-pointer hover:underline" onClick={() => setEditingGroup(g)}>{g}</h4>
                            )}
                            <button onClick={() => handleDeleteGroup(g)} className="text-gray-300 hover:text-red-500 text-xs font-bold uppercase">X</button>
                          </div>
                          <div className="space-y-2">
                            {groups[g].length === 0 && <p className="text-gray-400 font-bold text-xs">Vacío</p>}
                            {groups[g].map((p: any) => (
                              <div key={p.id} className="bg-gray-50 p-3 border border-gray-100 text-xs font-bold flex justify-between items-center">
                                {p.name}
                                <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-gray-400 hover:text-red-500 font-bold px-2">X</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      <button onClick={handleAddGroup} className="bg-gray-50 border border-dashed border-gray-300 flex flex-col items-center justify-center p-6 hover:bg-gray-100 transition min-h-[150px]">
                        <span className="text-xl font-bold text-gray-400 mb-2">+</span>
                        <span className="font-bold text-gray-400 uppercase tracking-widest text-xs">Añadir Grupo</span>
                      </button>
                    </div>
                    <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups}); alert("Guardado."); }} className="mt-8 w-full bg-black text-white p-4 font-bold text-sm tracking-widest uppercase hover:bg-gray-800">GUARDAR GRUPOS</button>
                  </div>
                </div>
              )}

              {/* === REGLAS === */}
              {step === 'rules' && (
                <div className="max-w-4xl mx-auto">
                  <div className="mb-10 pb-6 border-b border-gray-200">
                    <h3 className="text-lg font-bold mb-2 uppercase">Clasificación</h3>
                    <div className="bg-white p-6 border border-gray-200 flex justify-between items-center">
                      <span className="font-bold text-sm uppercase tracking-widest text-gray-600">Jugadores que avanzan por grupo:</span>
                      <input type="number" min="1" value={scoringRules.advancingPerGroup} onChange={e => setScoringRules({...scoringRules, advancingPerGroup: Number(e.target.value)})} className="w-24 p-3 text-xl font-bold border border-gray-300 text-center outline-none focus:border-black" />
                    </div>
                  </div>

                  <h3 className="text-lg font-bold mb-4 uppercase">Puntuación</h3>
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="bg-white p-6 border border-gray-200"><label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase">Puntos Victoria</label><input type="number" value={scoringRules.win} onChange={e => setScoringRules({...scoringRules, win: Number(e.target.value)})} className="w-full p-4 text-2xl font-bold border border-gray-300 outline-none focus:border-black" /></div>
                    <div className="bg-white p-6 border border-gray-200"><label className="block text-[10px] font-bold text-gray-400 mb-2 uppercase">Puntos Derrota</label><input type="number" value={scoringRules.loss} onChange={e => setScoringRules({...scoringRules, loss: Number(e.target.value)})} className="w-full p-4 text-2xl font-bold border border-gray-300 outline-none focus:border-black" /></div>
                    <div className="bg-gray-50 p-6 border border-gray-200"><label className="block text-[10px] font-bold text-gray-600 mb-2 uppercase">Victoria W.O.</label><input type="number" value={scoringRules.winWO} onChange={e => setScoringRules({...scoringRules, winWO: Number(e.target.value)})} className="w-full p-4 text-2xl font-bold border border-gray-300 outline-none focus:border-black bg-white" /></div>
                    <div className="bg-gray-50 p-6 border border-gray-200"><label className="block text-[10px] font-bold text-gray-600 mb-2 uppercase">Derrota W.O.</label><input type="number" value={scoringRules.lossWO} onChange={e => setScoringRules({...scoringRules, lossWO: Number(e.target.value)})} className="w-full p-4 text-2xl font-bold border border-gray-300 outline-none focus:border-black bg-white" /></div>
                  </div>
                  <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true }); alert("Reglas guardadas."); }} className="w-full bg-black text-white p-4 font-bold text-sm tracking-widest uppercase hover:bg-gray-800">GUARDAR REGLAS Y RECALCULAR</button>
                </div>
              )}

              {/* === RESULTADOS === */}
              {step === 'history' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold uppercase text-gray-500 text-xs tracking-widest">Monitor</h3>
                    <button onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'group'}); setIsManualModalOpen(true); }} className="bg-black text-white px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-800">+ REGISTRAR SCORE</button>
                  </div>
                  <div className="space-y-3">
                    {reportedMatches.filter(m => m.status === 'approved' || m.status === 'rival_pending' || m.status === 'rejected').map(m => (
                      <div key={m.id} className={`p-4 bg-white border flex justify-between items-center ${m.status === 'rejected' ? 'border-red-400' : 'border-gray-200'}`}>
                        <div className="flex items-center">
                          <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-1 uppercase mr-4 border border-gray-200">{m.groupName}</span>
                          <span className="font-bold text-sm text-black">{m.winnerName} <span className="text-gray-300 mx-2 text-xs">vs</span> {m.loserName}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-bold text-lg">{m.score}</span>
                          
                          {m.status === 'rival_pending' && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 border border-orange-100 uppercase">En Revisión</span>
                              <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id), {status: 'approved'})} className="bg-white border border-black text-black font-bold text-[10px] px-2 py-1 hover:bg-black hover:text-white transition uppercase">Aprobar</button>
                            </div>
                          )}
                          
                          {m.status === 'rejected' && <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id), {status: 'approved'})} className="bg-red-600 text-white font-bold text-[10px] px-3 py-1 uppercase">Forzar Aprobación</button>}

                          <button onClick={() => deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id))} className="text-red-500 font-bold text-xs uppercase hover:underline ml-2">X</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* === POSICIONES === */}
              {step === 'standings' && (
                <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {Object.keys(groups).map((gName) => {
                      const standings = calculateStandings(gName); 
                      return (
                          <div key={gName} className="bg-white border border-gray-200">
                              <div className="bg-gray-100 p-4 border-b border-gray-200"><h4 className="font-bold text-black text-sm uppercase tracking-widest">{gName}</h4></div>
                              <table className="w-full text-left">
                                  <thead className="bg-white text-gray-400 text-[10px] font-bold uppercase border-b border-gray-200">
                                      <tr><th className="p-4">Jugador</th><th className="p-4 text-center">PJ</th><th className="p-4 text-center">PG</th><th className="p-4 text-center text-black">PTS</th></tr>
                                  </thead>
                                  <tbody>
                                      {standings.map((s: any, i: number) => (
                                          <tr key={s.name} className="border-b border-gray-100">
                                            <td className="p-4 font-bold text-sm text-black"><span className="text-gray-300 mr-3">{i+1}</span>{s.name}</td>
                                            <td className="p-4 text-center font-bold text-gray-500 text-sm">{s.PJ}</td>
                                            <td className="p-4 text-center font-bold text-gray-500 text-sm">{s.PG}</td>
                                            <td className="p-4 text-center font-bold text-lg text-black">{s.Pts}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      );
                  })}
                </div>
              )}

              {/* === LLAVES === */}
              {step === 'brackets' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold uppercase text-gray-500 text-xs tracking-widest">Fase Final</h3>
                    <button onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'bracket'}); setIsManualModalOpen(true); }} className="bg-black text-white px-6 py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-800">+ RESULTADO LLAVE</button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {bracketMatches.map(bm => (
                      <div key={bm.id} className="border border-gray-200 p-6 bg-white">
                        <h4 className="font-bold text-black text-xs uppercase mb-4 tracking-widest border-b border-gray-200 pb-2">{bm.round}</h4>
                        <div className={`p-3 border mb-2 font-bold text-sm flex justify-between ${bm.winnerName === bm.player1 ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'}`}>
                          <span>{bm.player1}</span> {bm.winnerName === bm.player1 && <span>WIN</span>}
                        </div>
                        <div className={`p-3 border font-bold text-sm flex justify-between ${bm.winnerName === bm.player2 ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'}`}>
                          <span>{bm.player2}</span> {bm.winnerName === bm.player2 && <span>WIN</span>}
                        </div>
                        <div className="mt-4 text-center font-bold text-xl">{bm.status === 'approved' ? bm.score : '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* === AJUSTES === */}
              {step === 'settings' && (
                <div className="py-20 flex justify-center">
                  <div className="w-full max-w-lg p-10 bg-white border border-red-200 text-center">
                    <h3 className="text-xl font-bold mb-2 uppercase tracking-widest text-red-600">Zona Restringida</h3>
                    <p className="text-gray-500 font-bold text-sm mb-8">Eliminará el torneo y datos permanentemente.</p>
                    <button onClick={handleDeleteFullTournament} className="w-full bg-red-600 text-white p-4 font-bold text-sm tracking-widest uppercase hover:bg-red-700">ELIMINAR TORNEO</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL DE RESULTADOS (MINIMALISTA / CASILLAS AUTOMÁTICAS)
          ========================================================================= */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 w-full max-w-lg border border-gray-300">
            <h2 className="text-xl font-bold mb-6 text-center uppercase tracking-widest border-b border-gray-200 pb-4">
              {manualMatch.type === 'bracket' ? 'Score de Llave' : 'Score de Grupo'}
            </h2>
            
            <div className="space-y-6">
              
              {/* SELECTORES */}
              {manualMatch.type === 'bracket' ? (
                <select className="w-full p-4 border border-gray-300 font-bold text-sm outline-none focus:border-black" onChange={e => {
                  const match = bracketMatches.find(bm => bm.id === e.target.value);
                  if(match) setManualMatch({...manualMatch, groupName: match.id, winnerName: match.player1, loserName: match.player2});
                }}>
                   <option value="">Seleccionar Llave...</option>
                   {bracketMatches.filter(bm => bm.status !== 'approved').map(bm => <option key={bm.id} value={bm.id}>{bm.round}: {bm.player1} vs {bm.player2}</option>)}
                </select>
              ) : (
                <>
                  <select className="w-full p-4 border border-gray-300 font-bold text-sm outline-none focus:border-black" value={manualMatch.groupName} onChange={e => { resetModal(); setManualMatch({...manualMatch, type: 'group', groupName: e.target.value}); }}>
                     <option value="">Seleccionar Grupo...</option>
                     {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {manualMatch.groupName && (
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 border border-gray-200">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase">Ganador</label>
                        <select className="w-full p-3 border border-black font-bold text-sm outline-none" value={manualMatch.winnerName} onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})}>
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-2 uppercase">Perdedor</label>
                        <select className="w-full p-3 border border-gray-300 font-bold text-sm outline-none focus:border-black" value={manualMatch.loserName} onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}>
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* TOGGLE W.O. */}
              <div className="flex items-center justify-between p-4 bg-white border border-black">
                <span className="font-bold text-sm uppercase tracking-widest text-black">Victoria por W.O.</span>
                <input type="checkbox" checked={isWO} onChange={e => setIsWO(e.target.checked)} className="w-5 h-5 accent-black" />
              </div>

              {/* CASILLAS NUMÉRICAS (FLAT) */}
              {!isWO && (
                <div className="bg-white p-6 border border-gray-200">
                  <p className="text-[10px] font-bold text-gray-400 text-center uppercase mb-6 tracking-widest">Score Exacto</p>
                  
                  {/* SET 1 */}
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <span className="font-bold text-gray-400 w-10 text-right text-[10px] uppercase">Set 1</span>
                    <input id="s1w" value={sets.s1w} onChange={e => handleSetChange('s1w', e.target.value, 's1l')} className="w-12 h-12 text-center text-lg font-bold border border-gray-300 outline-none focus:border-black" />
                    <span className="font-bold text-gray-300">-</span>
                    <input id="s1l" value={sets.s1l} onChange={e => handleSetChange('s1l', e.target.value, 's2w')} className="w-12 h-12 text-center text-lg font-bold border border-gray-300 outline-none focus:border-black" />
                  </div>
                  
                  {/* SET 2 */}
                  <div className="flex items-center justify-center gap-3 mb-6">
                    <span className="font-bold text-gray-400 w-10 text-right text-[10px] uppercase">Set 2</span>
                    <input id="s2w" value={sets.s2w} onChange={e => handleSetChange('s2w', e.target.value, 's2l')} className="w-12 h-12 text-center text-lg font-bold border border-gray-300 outline-none focus:border-black" />
                    <span className="font-bold text-gray-300">-</span>
                    <input id="s2l" value={sets.s2l} onChange={e => handleSetChange('s2l', e.target.value, hasThirdSet ? 's3w' : null)} className="w-12 h-12 text-center text-lg font-bold border border-gray-300 outline-none focus:border-black" />
                  </div>

                  {/* TOGGLE 3ER SET */}
                  <div className="flex items-center justify-between mb-6 border-t border-gray-200 pt-4">
                    <span className="font-bold text-gray-600 text-xs uppercase tracking-widest">Tercer Set (Super Tie-break)</span>
                    <input type="checkbox" checked={hasThirdSet} onChange={e => { setHasThirdSet(e.target.checked); if(e.target.checked) setTimeout(()=>document.getElementById('s3w')?.focus(), 100); }} className="w-4 h-4 accent-black" />
                  </div>

                  {/* SET 3 */}
                  {hasThirdSet && (
                    <div className="flex items-center justify-center gap-3">
                      <span className="font-bold text-gray-400 w-10 text-right text-[10px] uppercase">Set 3</span>
                      <input id="s3w" value={sets.s3w} onChange={e => handleSetChange('s3w', e.target.value, 's3l')} className="w-12 h-12 text-center text-lg font-bold border border-gray-300 outline-none focus:border-black" />
                      <span className="font-bold text-gray-300">-</span>
                      <input id="s3l" value={sets.s3l} onChange={e => handleSetChange('s3l', e.target.value, null)} className="w-12 h-12 text-center text-lg font-bold border border-gray-300 outline-none focus:border-black" />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
              <button onClick={() => setIsManualModalOpen(false)} className="flex-1 p-4 border border-gray-300 font-bold text-xs uppercase tracking-widest text-gray-500 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-4 bg-black text-white font-bold text-xs uppercase tracking-widest hover:bg-gray-800">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo Torneo */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-8 w-full max-w-md border border-gray-300">
            <h2 className="text-xl font-bold mb-6 text-center uppercase tracking-widest border-b border-gray-200 pb-4">Nuevo Torneo</h2>
            <div className="space-y-4">
              <input type="text" placeholder="Nombre" className="w-full p-3 border border-gray-300 font-bold text-sm outline-none focus:border-black" onChange={e => setNewT({...newT, name: e.target.value})} />
              <input type="number" placeholder="Precio" className="w-full p-3 border border-gray-300 font-bold text-sm outline-none focus:border-black" onChange={e => setNewT({...newT, price: e.target.value})} />
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-3 border border-gray-300 font-bold text-xs uppercase tracking-widest hover:bg-gray-50">Cancelar</button>
              <button onClick={handleCreateTournament} className="flex-1 p-3 bg-black text-white font-bold text-xs uppercase tracking-widest">Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}