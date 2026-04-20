"use client";

import React, { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase'; 
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc 
} from 'firebase/firestore';

export default function AdminFinalMaster() {
  // ==========================================
  // ESTADOS DE LA APLICACIÓN
  // ==========================================
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
  const [manualMatch, setManualMatch] = useState({ winnerName: '', loserName: '', score: '', groupName: '', type: 'group' });

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: -2 });

  // ==========================================
  // EFECTOS Y LISTENERS
  // ==========================================
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
          setIsAdmin(adminDoc.exists());
        } catch (error) {
          console.error("Error verificando rol de admin:", error);
          setIsAdmin(false);
        }
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

    // Listener de Torneos
    const unsubT = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), (snap) => {
      setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Cargar Base de Jugadores
    const fetchPlayers = async () => {
      try {
        const snap = await getDocs(collection(db, "players")); 
        setAppPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Error al cargar los jugadores de la app:", error);
      }
    };

    fetchPlayers();
    return () => unsubT();
  }, [isAdmin]);

  useEffect(() => {
    if (!activeTournament || !isAdmin) return;
    
    // Limpieza de estado al cambiar de torneo para evitar datos fantasma
    setGroups({ "Grupo A": [], "Grupo B": [] });
    setReportedMatches([]);
    setBracketMatches([]);

    // Cargar configuración de grupos y reglas
    const loadConfig = async () => {
      try {
        const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
        if (gDoc.exists() && gDoc.data().structure) {
          setGroups(gDoc.data().structure);
        }
        
        const rDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
        if (rDoc.exists() && rDoc.data().win !== undefined) {
          setScoringRules(rDoc.data() as any);
        } else {
          setScoringRules({ win: 3, loss: 0, winWO: 3, lossWO: -2 });
        }
      } catch (error) {
        console.error("Error al cargar la configuración del torneo:", error);
      }
    }
    loadConfig();

    // Listeners de Partidos y Llaves
    const unsubM = onSnapshot(query(collection(db, "tournaments", activeTournament.id, "matches"), orderBy("createdAt", "desc")), (snap) => {
      setReportedMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubB = onSnapshot(query(collection(db, "tournaments", activeTournament.id, "bracket_matches"), orderBy("createdAt", "asc")), (snap) => {
      setBracketMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubM(); unsubB(); };
  }, [activeTournament, isAdmin]);

  // ==========================================
  // FUNCIONES DE CONTROL
  // ==========================================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error: any) {
      alert("Error al iniciar sesión. Revisa tus credenciales.");
      console.error(error);
    }
  };

  const handleCreateTournament = async () => {
    if (!newT.name || !newT.price) {
      return alert("Por favor, ingresa al menos el Nombre y el Precio del torneo.");
    }
    try {
      await addDoc(collection(db, "tournaments"), { 
        ...newT, 
        participantsIds: [], 
        createdAt: serverTimestamp() 
      });
      setIsModalOpen(false);
      setNewT({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Inscripciones' });
      alert("¡Torneo creado exitosamente!");
    } catch (error) {
      alert("Hubo un error al crear el torneo.");
      console.error(error);
    }
  };

  const handleDeleteFullTournament = async () => {
    const confirmText = prompt("ESTA ACCIÓN ES IRREVERSIBLE. Escribe 'ELIMINAR' para confirmar:");
    if (confirmText !== 'ELIMINAR') return;
    
    try {
      // 1. Borrar partidos de fase de grupos
      const matches = await getDocs(collection(db, "tournaments", activeTournament.id, "matches"));
      await Promise.all(matches.docs.map(d => deleteDoc(d.ref)));
      
      // 2. Borrar partidos de fase final (llaves)
      const brackets = await getDocs(collection(db, "tournaments", activeTournament.id, "bracket_matches"));
      await Promise.all(brackets.docs.map(d => deleteDoc(d.ref)));

      // 3. Borrar configuración
      await deleteDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      await deleteDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
      
      // 4. Borrar documento principal
      await deleteDoc(doc(db, "tournaments", activeTournament.id));
      
      setView('main');
      setActiveTournament(null);
      alert("El torneo ha sido eliminado por completo del sistema.");
    } catch (error) {
      alert("Error crítico al intentar borrar el torneo.");
      console.error(error);
    }
  };

  const handleAddManualMatch = async () => {
    if (!manualMatch.groupName || !manualMatch.winnerName || !manualMatch.loserName || !manualMatch.score) {
      return alert("Por favor, completa todos los campos para guardar el resultado.");
    }
    if (manualMatch.winnerName === manualMatch.loserName) {
      return alert("El ganador y el perdedor no pueden ser el mismo jugador.");
    }

    try {
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
        // En brackets, actualizamos el documento existente
        await updateDoc(doc(db, "tournaments", activeTournament.id, "bracket_matches", manualMatch.groupName), { 
          winnerName: manualMatch.winnerName, 
          loserName: manualMatch.loserName, 
          score: manualMatch.score, 
          status: 'approved' 
        });
      }
      setIsManualModalOpen(false);
      setManualMatch({ winnerName: '', loserName: '', score: '', groupName: '', type: 'group' });
      alert("Resultado registrado correctamente.");
    } catch (error) {
      alert("Error al guardar el resultado.");
      console.error(error);
    }
  };

  const handleGenerateFixture = async () => {
    if (!confirm("Esta acción generará los partidos pendientes para todos los grupos y cambiará el estado del torneo a 'Activo'. ¿Deseas continuar?")) return;
    
    try {
      const matchesRef = collection(db, "tournaments", activeTournament.id, "matches");
      let count = 0;

      for (const groupName of Object.keys(groups)) {
        const players = groups[groupName];
        for (let i = 0; i < players.length; i++) {
          for (let j = i + 1; j < players.length; j++) {
            await addDoc(matchesRef, {
              groupName: groupName, 
              player1: players[i].name, 
              player2: players[j].name,
              winnerName: '', 
              loserName: '', 
              score: '', 
              status: 'pending', 
              createdAt: serverTimestamp()
            });
            count++;
          }
        }
      }
      
      await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Activo' });
      setActiveTournament({...activeTournament, status: 'Activo'});
      alert(`¡Éxito! Se han generado ${count} partidos para la fase de grupos.`);
    } catch (error) {
      alert("Hubo un error al generar el fixture.");
      console.error(error);
    }
  };

  const handleGenerateBrackets = async () => {
    if (!confirm("Esto dará por finalizada la fase de grupos y creará los cruces de Semifinales automáticamente. ¿Estás seguro?")) return;
    
    try {
      const standingsA = calculateStandings("Grupo A");
      const standingsB = calculateStandings("Grupo B");
      
      if (standingsA.length < 2 || standingsB.length < 2) {
        return alert("Error: Se necesitan al menos 2 jugadores por grupo para poder generar las llaves de semifinales.");
      }

      const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
      
      // Cruce 1: 1ro del A vs 2do del B
      await addDoc(bracketRef, { 
        round: 'Semifinal 1', 
        player1: standingsA[0].name, 
        player2: standingsB[1].name, 
        winnerName: '', loserName: '', score: '', 
        status: 'pending', 
        createdAt: serverTimestamp() 
      });
      
      // Cruce 2: 1ro del B vs 2do del A
      await addDoc(bracketRef, { 
        round: 'Semifinal 2', 
        player1: standingsB[0].name, 
        player2: standingsA[1].name, 
        winnerName: '', loserName: '', score: '', 
        status: 'pending', 
        createdAt: serverTimestamp() 
      });

      await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Fase Final' });
      setActiveTournament({...activeTournament, status: 'Fase Final'});
      alert("¡Llaves de fase final generadas correctamente!");
    } catch (error) {
      alert("Ocurrió un error al generar las llaves.");
      console.error(error);
    }
  };

  const calculateStandings = (groupName: string) => {
    const players = groups[groupName] || [];
    let stats: any = {};
    
    // Inicialización segura de jugadores
    players.forEach((p: any) => { 
      stats[p.name] = { name: p.name, PJ: 0, PG: 0, PP: 0, Pts: 0, GW: 0, GL: 0 }; 
    });

    const validMatches = reportedMatches.filter(m => m.groupName === groupName && m.status === 'approved');

    validMatches.forEach(m => {
      const isWO = m.score.toUpperCase() === 'WO';
      const winner = stats[m.winnerName]; 
      const loser = stats[m.loserName];

      if(winner) { 
        winner.PJ++; 
        winner.PG++; 
        winner.Pts += isWO ? scoringRules.winWO : scoringRules.win; 
        if(isWO) winner.GW += 12; 
      }
      if(loser) { 
        loser.PJ++; 
        loser.PP++; 
        loser.Pts += isWO ? scoringRules.lossWO : scoringRules.loss; 
        if(isWO) loser.GL += 12; 
      }

      if(!isWO && winner && loser && m.score) {
        const sets = m.score.trim().split(' ');
        sets.forEach((set: string) => {
          const parts = set.split('-');
          if(parts.length === 2) {
            let w = parseInt(parts[0]); 
            let l = parseInt(parts[1]); 
            if(!isNaN(w) && !isNaN(l)) {
              if(w >= 10 || l >= 10 || (w === 7 && l === 6) || (w === 6 && l === 7)) { 
                winner.GW += (w > l ? 1 : 0); 
                loser.GW += (l > w ? 1 : 0); 
              } else { 
                winner.GW += w; winner.GL += l; 
                loser.GW += l; loser.GL += w; 
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

  // ==========================================
  // RENDERIZADO DE PANTALLAS
  // ==========================================
  
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center font-bold text-slate-400 uppercase tracking-widest animate-pulse">
          Verificando credenciales del sistema...
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <form onSubmit={handleLogin} className="bg-white p-10 rounded-[30px] shadow-2xl w-full max-w-sm">
          <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tighter">Panel Admin</h1>
          <div className="space-y-4 mb-8">
            <input 
              type="email" 
              required
              placeholder="Correo electrónico" 
              className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-black transition-colors" 
              onChange={e => setEmail(e.target.value)} 
            />
            <input 
              type="password" 
              required
              placeholder="Contraseña" 
              className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-black transition-colors" 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>
          <button type="submit" className="w-full bg-black text-white p-4 rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-all active:scale-95">
            INICIAR SESIÓN
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">
      
      {/* VISTA PRINCIPAL: CARTELERA DE TORNEOS */}
      {view === 'main' ? (
        <div className="p-10 max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-12 border-b-2 border-slate-200 pb-6">
            <div>
              <h1 className="text-4xl font-black tracking-tighter uppercase text-slate-900">Gestión de Torneos</h1>
              <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest">Panel de Control Principal</p>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-purple-600 text-white px-8 py-4 rounded-full font-black shadow-lg hover:bg-purple-700 hover:shadow-purple-500/30 transition-all">
              + NUEVO TORNEO
            </button>
          </div>

          {tournaments.length === 0 && (
            <div className="text-center py-20 bg-white border-2 border-dashed border-slate-300 rounded-[30px]">
              <p className="text-xl font-bold text-slate-400">No tienes torneos activos.</p>
              <p className="text-sm font-bold text-slate-400 mt-2">Haz clic en Nuevo Torneo para comenzar.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tournaments.map(t => (
              <div key={t.id} className="bg-white p-8 rounded-[30px] border-2 border-slate-100 shadow-sm hover:border-slate-300 hover:shadow-xl transition-all duration-300">
                <h2 className="text-2xl font-black mb-2 text-slate-800">{t.name}</h2>
                <div className="flex flex-wrap gap-2 mb-8 mt-4">
                  <span className="text-xs font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase">{t.category}</span>
                  <span className={`text-xs font-black px-3 py-1 rounded-full uppercase ${
                    t.status === 'Inscripciones' ? 'bg-blue-100 text-blue-700' : 
                    t.status === 'Activo' ? 'bg-green-100 text-green-700' : 
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {t.status}
                  </span>
                </div>
                <button onClick={() => { setActiveTournament(t); setStep('groups'); setView('manage'); }} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-black transition-colors">
                  ADMINISTRAR
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (

        // VISTA DE ADMINISTRACIÓN DE UN TORNEO ESPECÍFICO
        <div className="p-8 max-w-7xl mx-auto">
          {/* HEADER DEL TORNEO */}
          <div className="flex flex-wrap items-center gap-4 mb-8">
            <button onClick={() => setView('main')} className="bg-white border-2 border-slate-200 h-12 w-12 flex items-center justify-center rounded-full shadow-sm hover:bg-slate-100 font-black text-xl transition-colors">
              &larr;
            </button>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-slate-800">{activeTournament.name}</h2>
            <span className="text-xs font-black text-slate-500 bg-slate-200 px-4 py-2 rounded-full uppercase tracking-wider">{activeTournament.status}</span>
            
            <div className="ml-auto flex gap-3">
              {activeTournament.status === 'Inscripciones' && (
                <button onClick={handleGenerateFixture} className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:bg-purple-700 transition-colors">
                  GENERAR FIXTURE Y ACTIVAR &rarr;
                </button>
              )}
              {activeTournament.status === 'Activo' && (
                <button onClick={handleGenerateBrackets} className="bg-purple-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:bg-purple-700 transition-colors">
                  TERMINAR GRUPOS Y CREAR LLAVES &rarr;
                </button>
              )}
              {activeTournament.status === 'Fase Final' && (
                <button onClick={async () => {
                  if(confirm("¿Estás seguro de finalizar completamente el torneo?")) {
                    await updateDoc(doc(db, "tournaments", activeTournament.id), {status: 'Completado'});
                    setActiveTournament({...activeTournament, status: 'Completado'});
                  }
                }} className="bg-black text-white px-8 py-3 rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-colors">
                  FINALIZAR TORNEO 🏆
                </button>
              )}
            </div>
          </div>
          
          {/* CUERPO DEL PANEL DEL TORNEO */}
          <div className="bg-white rounded-[40px] shadow-2xl border-2 border-slate-100 overflow-hidden">
            
            {/* PESTAÑAS DE NAVEGACIÓN */}
            <div className="flex flex-wrap bg-white px-6 pt-6 gap-2 border-b-2 border-slate-100">
               {['groups', 'standings', 'history', 'brackets', 'rules', 'settings'].map(s => (
                 <button 
                  key={s} 
                  onClick={() => setStep(s)} 
                  className={`px-8 py-4 rounded-t-3xl text-xs font-black uppercase tracking-wider transition-all ${
                    step === s 
                      ? 'bg-white shadow-[0_-4px_10px_-2px_rgba(0,0,0,0.05)] text-slate-900 border-t-2 border-x-2 border-slate-100' 
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                 >
                    {s === 'groups' ? 'Grupos' : s === 'standings' ? 'Posiciones' : s === 'history' ? 'Resultados' : s === 'brackets' ? 'Llaves' : s === 'rules' ? 'Reglas' : 'Ajustes'}
                 </button>
               ))}
            </div>

            {/* CONTENIDO DE LAS PESTAÑAS */}
            <div className="p-10 bg-slate-50 min-h-[600px]">
              
              {/* TAB: GRUPOS */}
              {step === 'groups' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                  <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r-2 border-slate-200 lg:pr-10 pb-8 lg:pb-0">
                    <h3 className="font-black text-sm uppercase mb-6 text-slate-400 tracking-widest">Base de Jugadores</h3>
                    <input 
                      type="text" 
                      placeholder="Buscar jugador registrado..." 
                      className="w-full p-4 border-2 border-slate-200 rounded-2xl mb-6 font-bold outline-none focus:border-black transition-colors" 
                      onChange={e => setSearch(e.target.value)} 
                    />
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                      {appPlayers.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())).map(p => (
                        <div key={p.id} className="p-4 bg-white rounded-2xl border-2 border-slate-100 flex justify-between items-center shadow-sm">
                          <span className="font-bold text-sm text-slate-700">{p.name}</span>
                          <div className="flex gap-2">
                            <button onClick={() => setGroups({...groups, "Grupo A": [...(groups["Grupo A"]||[]), p]})} className="bg-slate-50 border-2 border-slate-200 px-3 py-1 rounded-xl text-xs font-black hover:bg-black hover:text-white hover:border-black transition-colors">+A</button>
                            <button onClick={() => setGroups({...groups, "Grupo B": [...(groups["Grupo B"]||[]), p]})} className="bg-slate-50 border-2 border-slate-200 px-3 py-1 rounded-xl text-xs font-black hover:bg-black hover:text-white hover:border-black transition-colors">+B</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="lg:col-span-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {Object.keys(groups).map(g => (
                        <div key={g} className="bg-white p-8 rounded-[30px] border-2 border-slate-200 shadow-sm">
                          <h4 className="font-black uppercase text-xl mb-6 text-slate-800">{g}</h4>
                          <div className="space-y-3">
                            {groups[g].length === 0 && <p className="text-slate-400 font-bold text-sm">Grupo vacío</p>}
                            {groups[g].map((p: any) => (
                              <div key={p.id} className="bg-slate-50 p-4 rounded-xl border-2 border-slate-100 text-sm font-bold flex justify-between items-center">
                                {p.name}
                                <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-slate-400 hover:text-red-500 hover:bg-red-50 h-8 w-8 rounded-lg flex items-center justify-center transition-colors">&times;</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={async () => { 
                        await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups}); 
                        alert("Estructura de grupos guardada correctamente."); 
                      }} 
                      className="mt-10 w-full bg-black text-white p-5 rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-colors text-lg tracking-wide"
                    >
                      GUARDAR GRUPOS EN LA BASE DE DATOS
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: REGLAS */}
              {step === 'rules' && (
                <div className="max-w-4xl mx-auto py-4">
                  <div className="mb-10 text-center">
                    <h3 className="text-3xl font-black mb-3 uppercase tracking-tighter text-slate-800">Configuración de Puntuación</h3>
                    <p className="text-slate-500 font-bold">Modifica el valor exacto de cada escenario. La tabla de posiciones se recalculará automáticamente.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div className="bg-white p-8 rounded-[30px] border-2 border-slate-100 shadow-sm">
                      <label className="block text-xs font-black text-slate-400 mb-4 uppercase tracking-wider">Puntos por Victoria</label>
                      <input type="number" value={scoringRules.win} onChange={e => setScoringRules({...scoringRules, win: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 border-slate-100 rounded-2xl bg-slate-50 focus:border-black outline-none text-green-600 transition-colors" />
                    </div>
                    <div className="bg-white p-8 rounded-[30px] border-2 border-slate-100 shadow-sm">
                      <label className="block text-xs font-black text-slate-400 mb-4 uppercase tracking-wider">Puntos por Derrota</label>
                      <input type="number" value={scoringRules.loss} onChange={e => setScoringRules({...scoringRules, loss: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 border-slate-100 rounded-2xl bg-slate-50 focus:border-black outline-none text-slate-700 transition-colors" />
                    </div>
                    <div className="bg-green-50 p-8 rounded-[30px] border-2 border-green-100">
                      <label className="block text-xs font-black text-green-700 mb-4 uppercase tracking-wider">Victoria por W.O.</label>
                      <input type="number" value={scoringRules.winWO} onChange={e => setScoringRules({...scoringRules, winWO: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 border-green-200 rounded-2xl bg-white focus:border-green-500 outline-none text-green-700 transition-colors" />
                    </div>
                    <div className="bg-red-50 p-8 rounded-[30px] border-2 border-red-100">
                      <label className="block text-xs font-black text-red-700 mb-4 uppercase tracking-wider">Derrota por W.O. (Penalización)</label>
                      <input type="number" value={scoringRules.lossWO} onChange={e => setScoringRules({...scoringRules, lossWO: Number(e.target.value)})} className="w-full p-6 text-3xl font-black border-2 border-red-200 rounded-2xl bg-white focus:border-red-500 outline-none text-red-600 transition-colors" />
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true });
                      alert("Nuevas reglas guardadas y aplicadas.");
                    }} 
                    className="w-full bg-black text-white p-6 rounded-2xl font-black shadow-xl text-lg hover:bg-slate-800 transition-colors"
                  >
                    GUARDAR REGLAS Y RECALCULAR
                  </button>
                </div>
              )}

              {/* TAB: RESULTADOS */}
              {step === 'history' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex flex-wrap justify-between items-center mb-10">
                    <h3 className="font-black uppercase text-slate-400 tracking-widest text-sm">Resultados Confirmados</h3>
                    <button onClick={() => { setManualMatch({...manualMatch, type: 'group'}); setIsManualModalOpen(true); }} className="bg-black text-white px-8 py-4 rounded-full font-black shadow-lg hover:bg-slate-800 transition-all">
                      + AÑADIR RESULTADO MANUAL
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {reportedMatches.filter(m => m.status === 'approved').length === 0 && (
                      <div className="text-slate-400 text-center py-16 font-bold bg-white border-2 border-dashed border-slate-200 rounded-[30px]">
                        Aún no hay partidos confirmados en la fase de grupos.
                      </div>
                    )}
                    {reportedMatches.filter(m => m.status === 'approved').map(m => (
                      <div key={m.id} className="p-6 bg-white border-2 border-slate-100 shadow-sm rounded-3xl flex flex-wrap justify-between items-center gap-4 hover:border-slate-300 transition-colors">
                        <div className="flex items-center">
                          <span className="text-xs font-black bg-slate-100 text-slate-600 px-4 py-2 rounded-full uppercase mr-6">{m.groupName}</span>
                          <span className="font-black text-xl text-slate-800">{m.winnerName} <span className="text-slate-300 mx-3 text-sm font-bold">vs</span> {m.loserName}</span>
                        </div>
                        <div className="flex items-center gap-8">
                          <span className="font-black text-3xl tracking-tighter">{m.score}</span>
                          <button onClick={() => deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id))} className="text-red-500 hover:text-white font-bold bg-red-50 hover:bg-red-500 px-4 py-2 rounded-xl transition-colors">
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB: POSICIONES */}
              {step === 'standings' && (
                <div className="max-w-6xl mx-auto">
                   <h3 className="font-black uppercase text-slate-400 mb-8 tracking-widest text-sm text-center">Tabla General en Tiempo Real</h3>
                   <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                      {Object.keys(groups).map((gName) => {
                          const standings = calculateStandings(gName); 
                          return (
                              <div key={gName} className="bg-white border-2 border-slate-100 shadow-lg rounded-[30px] overflow-hidden">
                                  <div className="bg-slate-900 p-6">
                                    <h4 className="font-black text-white text-xl tracking-tight uppercase">{gName}</h4>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead className="bg-slate-50 text-slate-400 text-xs font-black uppercase border-b-2 border-slate-100">
                                            <tr>
                                              <th className="p-6">Jugador</th>
                                              <th className="p-6 text-center">PJ</th>
                                              <th className="p-6 text-center">PG</th>
                                              <th className="p-6 text-center text-slate-800">PTS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {standings.length === 0 && (
                                              <tr><td colSpan={4} className="p-6 text-center text-slate-400 font-bold">Grupo sin jugadores</td></tr>
                                            )}
                                            {standings.map((s: any, i: number) => (
                                                <tr key={s.name} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                                  <td className="p-6 font-black text-slate-700">
                                                    <span className="text-slate-300 mr-4 font-bold">{i+1}</span>{s.name}
                                                  </td>
                                                  <td className="p-6 text-center font-bold text-slate-500">{s.PJ}</td>
                                                  <td className="p-6 text-center font-bold text-slate-500">{s.PG}</td>
                                                  <td className="p-6 text-center font-black text-2xl text-green-600">{s.Pts}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                  </div>
                              </div>
                          );
                      })}
                   </div>
                </div>
              )}

              {/* TAB: LLAVES */}
              {step === 'brackets' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex flex-wrap justify-between items-center mb-10">
                    <h3 className="font-black uppercase text-slate-400 tracking-widest text-sm">Cuadro de Fase Final</h3>
                    <button onClick={() => { setManualMatch({...manualMatch, type: 'bracket'}); setIsManualModalOpen(true); }} className="bg-purple-600 text-white px-8 py-4 rounded-full font-black shadow-lg hover:bg-purple-700 transition-colors">
                      + RESULTADO MANUAL DE LLAVE
                    </button>
                  </div>
                  
                  {bracketMatches.length === 0 ? (
                    <div className="text-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[30px] font-bold text-slate-400 text-lg">
                      Las llaves se generarán automáticamente cuando el administrador finalice la fase de grupos.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {bracketMatches.map(bm => (
                        <div key={bm.id} className="border-2 border-slate-100 rounded-[30px] p-8 bg-white shadow-sm hover:shadow-md transition-shadow">
                          <h4 className="font-black text-purple-600 text-sm uppercase mb-6 tracking-widest">{bm.round}</h4>
                          
                          <div className={`p-5 rounded-2xl border-2 mb-4 font-bold flex justify-between items-center transition-colors ${bm.winnerName === bm.player1 ? 'border-green-400 bg-green-50 text-green-800' : 'border-slate-100 bg-slate-50 text-slate-700'}`}>
                            <span className="text-lg">{bm.player1}</span> 
                            {bm.winnerName === bm.player1 && <span className="text-green-600 text-xl">🏆</span>}
                          </div>
                          
                          <div className={`p-5 rounded-2xl border-2 font-bold flex justify-between items-center transition-colors ${bm.winnerName === bm.player2 ? 'border-green-400 bg-green-50 text-green-800' : 'border-slate-100 bg-slate-50 text-slate-700'}`}>
                            <span className="text-lg">{bm.player2}</span> 
                            {bm.winnerName === bm.player2 && <span className="text-green-600 text-xl">🏆</span>}
                          </div>
                          
                          <div className="mt-8 text-center">
                            {bm.status === 'approved' ? (
                               <span className="font-black text-3xl tracking-tighter">{bm.score}</span>
                            ) : (
                               <span className="bg-orange-100 text-orange-600 px-4 py-2 rounded-full font-black text-xs uppercase tracking-widest">Pendiente de jugar</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB: AJUSTES (ZONA PELIGRO) */}
              {step === 'settings' && (
                <div className="py-20 flex justify-center">
                  <div className="w-full max-w-lg p-12 bg-white border-4 border-red-100 border-dashed rounded-[40px] text-center shadow-sm">
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <span className="text-4xl">⚠️</span>
                    </div>
                    <h3 className="text-3xl font-black mb-4 text-slate-900 tracking-tight">Zona Restringida</h3>
                    <p className="text-slate-500 font-bold mb-10 leading-relaxed">
                      Borrar este torneo eliminará la estructura de grupos, todas las tablas de posiciones y el historial de partidos registrados de forma permanente.
                    </p>
                    <button onClick={handleDeleteFullTournament} className="w-full bg-red-600 text-white p-5 rounded-2xl font-black shadow-xl hover:bg-red-700 transition-colors text-lg tracking-wide">
                      ELIMINAR TORNEO
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODALES
          ========================================== */}
          
      {/* MODAL: NUEVO TORNEO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-10 rounded-[40px] w-full max-w-lg shadow-2xl">
            <h2 className="text-3xl font-black mb-8 uppercase tracking-tighter text-center">Nuevo Torneo</h2>
            <div className="space-y-5">
              <input type="text" placeholder="Nombre Oficial del Torneo" className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-purple-600 transition-colors" onChange={e => setNewT({...newT, name: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <select className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold bg-white outline-none focus:border-purple-600" onChange={e => setNewT({...newT, category: e.target.value})}>
                  <option>3ra Categoría</option>
                  <option>4ta Categoría</option>
                  <option>5ta Categoría</option>
                </select>
                <input type="number" placeholder="Precio (S/)" className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold outline-none focus:border-purple-600" onChange={e => setNewT({...newT, price: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 ml-2 uppercase">Fecha Inicio</label>
                  <input type="date" className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-600" onChange={e => setNewT({...newT, startDate: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 ml-2 uppercase">Fecha Fin</label>
                  <input type="date" className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-purple-600" onChange={e => setNewT({...newT, endDate: e.target.value})} />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-10">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 p-5 border-2 border-slate-200 rounded-2xl font-black text-slate-500 hover:bg-slate-50 transition-colors">CANCELAR</button>
              <button onClick={handleCreateTournament} className="flex-1 p-5 bg-purple-600 text-white rounded-2xl font-black shadow-lg hover:bg-purple-700 transition-colors">CREAR AHORA</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESULTADO MANUAL CON AUTOCOMPLETADO */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-10 rounded-[40px] w-full max-w-lg shadow-2xl">
            <h2 className="text-3xl font-black mb-8 uppercase tracking-tighter text-center text-slate-900">
              {manualMatch.type === 'bracket' ? 'Resultado de Llave' : 'Resultado de Grupo'}
            </h2>
            
            <div className="space-y-6">
              {/* SELECTOR INTELIGENTE: Depende si es Grupo o Llave */}
              {manualMatch.type === 'bracket' ? (
                <select 
                  className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 bg-slate-50 outline-none focus:border-black transition-colors" 
                  onChange={e => {
                    const match = bracketMatches.find(bm => bm.id === e.target.value);
                    if(match) setManualMatch({...manualMatch, groupName: match.id, winnerName: match.player1, loserName: match.player2});
                  }}
                >
                   <option value="">Selecciona el Partido Pendiente...</option>
                   {bracketMatches.filter(bm => bm.status !== 'approved').map(bm => <option key={bm.id} value={bm.id}>{bm.round}: {bm.player1} vs {bm.player2}</option>)}
                </select>
              ) : (
                <>
                  <select 
                    className="w-full p-5 border-2 border-slate-200 rounded-2xl font-bold text-slate-700 bg-slate-50 outline-none focus:border-black transition-colors" 
                    value={manualMatch.groupName} 
                    onChange={e => setManualMatch({...manualMatch, groupName: e.target.value, winnerName: '', loserName: ''})}
                  >
                     <option value="">Selecciona el Grupo...</option>
                     {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {/* AUTOCOMPLETADO DE JUGADORES */}
                  {manualMatch.groupName && (
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-3xl border-2 border-slate-100">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 mb-2 ml-2 uppercase text-center">Ganador</label>
                        <select 
                          className="w-full p-4 border-2 border-green-200 rounded-2xl font-bold bg-white text-green-700 outline-none focus:border-green-500 transition-colors" 
                          value={manualMatch.winnerName} 
                          onChange={e => setManualMatch({...manualMatch, winnerName: e.target.value})}
                        >
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 mb-2 ml-2 uppercase text-center">Perdedor</label>
                        <select 
                          className="w-full p-4 border-2 border-slate-200 rounded-2xl font-bold bg-white text-slate-700 outline-none focus:border-slate-400 transition-colors" 
                          value={manualMatch.loserName} 
                          onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}
                        >
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 ml-2 uppercase">Score Exacto</label>
                <input 
                  type="text" 
                  placeholder="Ej: 6-4 6-2 o WO" 
                  className="w-full p-6 border-2 border-slate-200 rounded-2xl font-black text-2xl text-center outline-none focus:border-black tracking-widest uppercase transition-colors" 
                  value={manualMatch.score} 
                  onChange={e => setManualMatch({...manualMatch, score: e.target.value})} 
                />
              </div>
            </div>
            
            <div className="flex gap-4 mt-10">
              <button onClick={() => { setIsManualModalOpen(false); setManualMatch({...manualMatch, type: 'group'}); }} className="flex-1 p-5 border-2 border-slate-200 rounded-2xl font-black text-slate-500 hover:bg-slate-50 transition-colors">CANCELAR</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-5 bg-black text-white rounded-2xl font-black shadow-lg hover:bg-slate-800 transition-colors tracking-wide">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}