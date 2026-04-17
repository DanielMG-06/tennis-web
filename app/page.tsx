"use client";

import React, { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase'; 
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, addDoc, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc 
} from 'firebase/firestore';

export default function AdminAutoFlat() {
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [view, setView] = useState('main'); 
  const [step, setStep] = useState('groups'); // groups, rules, history, standings, settings
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [activeTournament, setActiveTournament] = useState<any>(null);
  const [appPlayers, setAppPlayers] = useState<any[]>([]);
  const [reportedMatches, setReportedMatches] = useState<any[]>([]); 
  
  const [newT, setNewT] = useState({ name: '', category: '3ra', yape: '', desc: '', price: '', regDate: '', startDate: '', endDate: '' });
  const [editT, setEditT] = useState<any>({}); // Estado para editar el torneo

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: 0 });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
        if (adminDoc.exists()) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          alert("Acceso denegado: No tienes permisos de administrador.");
          signOut(auth);
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
    const unsubT = onSnapshot(query(collection(db, "tournaments"), orderBy("createdAt", "desc")), (snap) => {
      setTournaments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const fetchPlayers = async () => {
      try {
        const snap = await getDocs(collection(db, "users")); 
        setAppPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    };
    fetchPlayers();
    return () => unsubT();
  }, [isAdmin]);

  useEffect(() => {
    if (!activeTournament || !isAdmin) return;
    
    // Cargar datos al editar
    setEditT(activeTournament);

    const unsubM = onSnapshot(query(collection(db, "tournaments", activeTournament.id, "matches"), orderBy("createdAt", "desc")), (snap) => {
      setReportedMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsubM();
  }, [activeTournament, isAdmin]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, email, password); } 
    catch (error) { alert("Credenciales incorrectas. Intenta de nuevo."); }
  };

  const handleLogout = () => {
    signOut(auth);
    setView('main');
  };

  const calculateStandings = (groupName: string) => {
    const players = groups[groupName] || [];
    let stats: any = {};
    players.forEach((p: any) => { stats[p.name] = { name: p.name, PJ: 0, PG: 0, PP: 0, Pts: 0, GW: 0, GL: 0 }; });

    const isPastDeadline = activeTournament?.endDate ? new Date() > new Date(activeTournament.endDate) : false;
    const validMatches = reportedMatches.filter(m => m.groupName === groupName && (m.status === 'approved' || (m.status === 'pending' && isPastDeadline)));

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

  const handleCreate = async () => {
    if(!newT.name || !newT.price || !newT.endDate) return alert("Faltan datos obligatorios");
    await addDoc(collection(db, "tournaments"), { ...newT, status: 'Inscripciones', createdAt: serverTimestamp() });
    setIsModalOpen(false);
    setNewT({ name: '', category: '3ra', yape: '', desc: '', price: '', regDate: '', startDate: '', endDate: '' });
  };

  // NUEVO: Función para actualizar torneo existente
  const handleUpdateTournament = async () => {
    if(!editT.name || !editT.price) return alert("El nombre y precio no pueden estar vacíos.");
    try {
      await updateDoc(doc(db, "tournaments", activeTournament.id), { ...editT });
      alert("¡Torneo actualizado correctamente!");
      setActiveTournament({ ...activeTournament, ...editT });
    } catch (e) {
      alert("Error al actualizar el torneo.");
    }
  };

  const saveConfig = async () => {
    const tRef = doc(db, "tournaments", activeTournament.id);
    await setDoc(doc(tRef, "configuration", "groups"), { structure: groups, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(tRef, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true });
    alert("¡Configuración de Grupos y Reglas guardada!");
  };

  const deleteMatch = async (matchId: string) => {
    if(!confirm("¿Borrar este resultado?")) return;
    await deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", matchId));
  };

  // Lógica de Grupos
  const addPlayerToGroup = (p: any, gName: string) => {
    if (groups[gName].find((x: any) => x.id === p.id)) return;
    setGroups((prev: any) => ({ ...prev, [gName]: [...prev[gName], { id: p.id, name: p.name || 'Sin Nombre', type: 'app' }] }));
  };
  const removePlayerFromGroup = (pId: string, gName: string) => setGroups((prev: any) => ({ ...prev, [gName]: prev[gName].filter((x: any) => x.id !== pId) }));
  const addGroup = () => setGroups({ ...groups, [`Grupo ${String.fromCharCode(65 + Object.keys(groups).length)}`]: [] });
  
  // NUEVO: Eliminar grupo completo
  const removeGroup = (gName: string) => {
    if(!confirm(`¿Seguro que deseas eliminar el ${gName} y todos sus jugadores?`)) return;
    const newGroups = { ...groups };
    delete newGroups[gName];
    setGroups(newGroups);
  };

  const addExternalPlayer = (gName: string) => {
    const name = prompt(`Nombre del invitado:`);
    if (name) addPlayerToGroup({ id: `ext_${Date.now()}`, name: name, type: 'external' }, gName);
  };

  // NUEVO: Buscador de DNI blindado (Convierte a String por si acaso)
  const filteredPlayers = appPlayers.filter(p => {
    const term = search.toLowerCase();
    const nameMatch = (p.name || '').toLowerCase().includes(term);
    const dniMatch = String(p.dni || '').includes(term);
    return nameMatch || dniMatch;
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-bold uppercase tracking-widest">Verificando seguridad...</div>;

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans p-6 text-slate-900">
        <div className="bg-white p-10 border border-slate-200 w-full max-w-md rounded-lg shadow-sm">
          <div className="text-center mb-10 border-b border-slate-100 pb-6">
            <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900">Centro de Mando</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-2">Acceso Restringido</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Correo Administrador</label>
              <input type="email" required className="w-full p-4 bg-white border-2 border-slate-200 rounded text-slate-900 font-bold outline-none focus:border-slate-900" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Contraseña</label>
              <input type="password" required className="w-full p-4 bg-white border-2 border-slate-200 rounded text-slate-900 font-bold outline-none focus:border-slate-900" onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="w-full bg-slate-900 text-white font-black uppercase tracking-widest py-4 rounded hover:bg-slate-800 mt-4">Ingresar al Sistema</button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'main') {
    return (
      <div className="p-10 bg-slate-50 min-h-screen text-slate-900 font-sans">
        <header className="flex justify-between items-center mb-10 border-b border-slate-200 pb-6">
          <div>
             <h1 className="text-3xl font-bold">Torneos Activos</h1>
             <p className="text-xs text-slate-400 font-bold uppercase mt-1">Admin: {user.email}</p>
          </div>
          <div className="flex gap-4">
             <button onClick={handleLogout} className="text-slate-500 font-bold hover:text-red-500 transition">Cerrar Sesión</button>
             <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 text-white px-6 py-2 rounded font-semibold hover:bg-slate-800 transition">+ Nuevo Torneo</button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tournaments.map(t => (
            <div key={t.id} className="bg-white p-6 border border-slate-200 rounded-lg hover:border-slate-400 transition">
              <h2 className="text-xl font-bold mb-2">{t.name}</h2>
              <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded font-bold uppercase">{t.category}</span>
              <p className="text-slate-500 text-sm mt-4 mb-6">Cierre: <span className="font-semibold">{t.endDate || 'No definido'}</span></p>
              <button onClick={() => { setActiveTournament(t); setView('manage'); }} className="w-full border border-slate-300 py-2 rounded font-semibold hover:bg-slate-50">Administrar</button>
            </div>
          ))}
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-2xl border border-slate-200 rounded-lg shadow-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-bold">Crear Torneo</h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 font-bold text-xl">&times;</button>
              </div>
              <div className="p-6 grid grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Nombre</label><input type="text" className="w-full p-2 border border-slate-300 rounded outline-none" onChange={e => setNewT({...newT, name: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label><select className="w-full p-2 border border-slate-300 rounded outline-none" onChange={e => setNewT({...newT, category: e.target.value})}><option>3ra</option><option>4ta</option><option>5ta</option></select></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Precio (S/)</label><input type="number" className="w-full p-2 border border-slate-300 rounded outline-none" onChange={e => setNewT({...newT, price: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Fecha de Inicio</label><input type="date" className="w-full p-2 border border-slate-300 rounded outline-none" onChange={e => setNewT({...newT, startDate: e.target.value})} /></div>
                <div><label className="block text-xs font-bold text-slate-500 mb-1">Fecha de Cierre (Auto-aprobación)</label><input type="date" className="w-full p-2 border border-slate-300 rounded outline-none" onChange={e => setNewT({...newT, endDate: e.target.value})} /></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Número Yape</label><input type="text" className="w-full p-2 border border-slate-300 rounded outline-none" onChange={e => setNewT({...newT, yape: e.target.value})} /></div>
                <div className="col-span-2"><label className="block text-xs font-bold text-slate-500 mb-1">Reglas y Descripción</label><textarea rows={3} className="w-full p-2 border border-slate-300 rounded outline-none resize-none" onChange={e => setNewT({...newT, desc: e.target.value})} /></div>
              </div>
              <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
                <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-600 font-semibold rounded">Cancelar</button>
                <button onClick={handleCreate} className="px-6 py-2 bg-slate-900 text-white font-semibold rounded">Publicar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-6">
          <button onClick={() => setView('main')} className="text-slate-500 font-bold hover:text-slate-900">&larr; Volver</button>
          <h2 className="text-xl font-bold border-l border-slate-300 pl-6 uppercase">{activeTournament.name}</h2>
          <div className="flex gap-4 ml-8">
            <button onClick={()=>setStep('groups')} className={`text-sm font-semibold pb-1 ${step==='groups'?'border-b-2 border-slate-900':'text-slate-500'}`}>Grupos</button>
            <button onClick={()=>setStep('rules')} className={`text-sm font-semibold pb-1 ${step==='rules'?'border-b-2 border-slate-900':'text-slate-500'}`}>Reglas</button>
            <button onClick={()=>setStep('history')} className={`text-sm font-semibold pb-1 ${step==='history'?'border-b-2 border-slate-900':'text-slate-500'}`}>Historial P2P</button>
            <button onClick={()=>setStep('standings')} className={`text-sm font-semibold pb-1 ${step==='standings'?'border-b-2 border-slate-900':'text-slate-500'}`}>Posiciones</button>
            <button onClick={()=>setStep('settings')} className={`text-sm font-semibold pb-1 ${step==='settings'?'border-b-2 border-slate-900':'text-slate-500'}`}>Ajustes</button>
          </div>
        </div>
        <button onClick={saveConfig} className="bg-slate-900 text-white px-6 py-2 rounded font-semibold hover:bg-slate-800 transition">Guardar Cambios</button>
      </div>

      <div className="flex-1 p-8">
        
        {step === 'groups' && ( 
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-4 bg-white border border-slate-200 rounded-lg p-0 h-fit sticky top-24 overflow-hidden shadow-sm">
              <div className="bg-slate-900 p-4">
                <h3 className="text-sm font-bold text-white mb-3 uppercase tracking-widest flex justify-between items-center">
                  Base de Jugadores
                  <span className="bg-green-500 text-white text-[10px] px-2 py-1 rounded-full">{appPlayers.length} total</span>
                </h3>
                <div className="relative">
                  <span className="absolute left-3 top-3.5 text-slate-400">🔍</span>
                  <input 
                    type="text" 
                    placeholder="Ej: nicolas, 7421..." 
                    className="w-full p-3 pl-9 border-0 rounded shadow-inner text-slate-900 text-sm font-bold outline-none focus:ring-2 focus:ring-green-500 transition-all" 
                    value={search} 
                    onChange={e => setSearch(e.target.value)} 
                  />
                </div>
              </div>
              
              <div className="max-h-[50vh] overflow-y-auto p-2 bg-slate-50">
                {search.length > 0 && filteredPlayers.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-8 font-bold">No hay nadie llamado "{search}"</p>
                )}
                {search.length === 0 && appPlayers.length === 0 && (
                  <div className="text-center py-8 px-4">
                    <p className="text-sm text-slate-600 font-bold mb-2">Base de datos vacía</p>
                    <p className="text-xs text-slate-400">Nadie ha iniciado sesión en tu app de Flutter todavía.</p>
                  </div>
                )}
                
                {filteredPlayers.map(p => (
                  <div key={p.id} className="p-3 border border-slate-200 rounded bg-white shadow-sm mb-2 flex flex-col gap-2 hover:border-green-400 transition-colors">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-sm text-slate-800">{p.name || 'Sin nombre'}</span>
                      <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded">DNI: {p.dni || '---'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1 border-t border-slate-100 pt-2">
                      {Object.keys(groups).map(g => (
                        <button key={g} onClick={() => addPlayerToGroup(p, g)} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-1 rounded font-bold hover:bg-green-500 hover:text-white hover:border-green-500 transition-all">
                          + {g}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-span-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-800">Grupos Armados</h3>
                <button onClick={addGroup} className="text-sm font-bold bg-slate-200 px-4 py-2 rounded hover:bg-slate-300 transition">+ Añadir Grupo</button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(groups).map(gName => (
                  <div key={gName} className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-3">
                         <h4 className="font-bold">{gName}</h4>
                         <button onClick={() => removeGroup(gName)} className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded hover:bg-red-100">Eliminar</button>
                      </div>
                      <button onClick={() => addExternalPlayer(gName)} className="text-xs font-bold text-blue-600 hover:underline">+ Invitado</button>
                    </div>
                    <div className="space-y-2">
                      {groups[gName].length === 0 && <p className="text-xs text-slate-400 italic">Grupo vacío</p>}
                      {groups[gName].map((p: any) => (
                        <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 border border-slate-100 rounded text-sm">
                          <span className="font-semibold flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${p.type === 'external' ? 'bg-orange-500' : 'bg-green-500'}`}></span>{p.name}</span>
                          <button onClick={() => removePlayerFromGroup(p.id, gName)} className="text-slate-400 hover:text-red-500 font-bold">&times;</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'settings' && (
          <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-lg p-8">
            <h3 className="text-xl font-bold mb-6">Ajustes Generales del Torneo</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Torneo</label>
                <input type="text" className="w-full p-3 border border-slate-300 rounded outline-none" value={editT.name || ''} onChange={e => setEditT({...editT, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                <select className="w-full p-3 border border-slate-300 rounded outline-none" value={editT.category || '3ra'} onChange={e => setEditT({...editT, category: e.target.value})}>
                  <option>3ra</option><option>4ta</option><option>5ta</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Precio (S/)</label>
                <input type="number" className="w-full p-3 border border-slate-300 rounded outline-none" value={editT.price || ''} onChange={e => setEditT({...editT, price: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha de Inicio</label>
                <input type="date" className="w-full p-3 border border-slate-300 rounded outline-none" value={editT.startDate || ''} onChange={e => setEditT({...editT, startDate: e.target.value})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Fecha de Cierre (Auto-aprobación)</label>
                <input type="date" className="w-full p-3 border border-slate-300 rounded outline-none" value={editT.endDate || ''} onChange={e => setEditT({...editT, endDate: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Número Yape</label>
                <input type="text" className="w-full p-3 border border-slate-300 rounded outline-none" value={editT.yape || ''} onChange={e => setEditT({...editT, yape: e.target.value})} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Descripción y Reglas Adicionales</label>
                <textarea rows={4} className="w-full p-3 border border-slate-300 rounded outline-none resize-none" value={editT.desc || ''} onChange={e => setEditT({...editT, desc: e.target.value})} />
              </div>
              <div className="col-span-2 flex justify-end mt-4">
                 <button onClick={handleUpdateTournament} className="bg-slate-900 text-white px-8 py-3 rounded font-bold hover:bg-slate-800 transition">
                   Guardar Ajustes del Torneo
                 </button>
              </div>
            </div>
          </div>
        )}

        {/* REGLAS, HISTORIAL y POSICIONES se mantienen idénticos */}
        {step === 'rules' && ( 
          <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-lg p-8">
             <h3 className="text-xl font-bold mb-6">Reglas de Puntuación</h3>
             <div className="grid grid-cols-2 gap-4 mb-8">
                <button onClick={()=>setScoringRules({win:3, loss:0, winWO:3, lossWO:0})} className="p-4 border border-slate-300 rounded text-left hover:bg-slate-50">
                  <p className="font-bold mb-1">Estandar</p><p className="text-xs text-slate-500">Victoria +3 | Derrota 0 | WO 0</p>
                </button>
                <button onClick={()=>setScoringRules({win:3, loss:1, winWO:3, lossWO:-2})} className="p-4 border border-slate-300 rounded text-left hover:bg-slate-50">
                  <p className="font-bold mb-1">Competitivo</p><p className="text-xs text-slate-500">Victoria +3 | Derrota +1 | WO -2</p>
                </button>
             </div>
             <div className="bg-slate-50 border border-slate-200 p-6 rounded grid grid-cols-3 gap-4 text-center">
                <div><p className="text-xs font-bold text-slate-500 uppercase">Ganar</p><p className="text-2xl font-bold">+{scoringRules.win}</p></div>
                <div><p className="text-xs font-bold text-slate-500 uppercase">Perder</p><p className="text-2xl font-bold">+{scoringRules.loss}</p></div>
                <div><p className="text-xs font-bold text-slate-500 uppercase">WO</p><p className="text-2xl font-bold text-red-600">{scoringRules.lossWO}</p></div>
             </div>
          </div>
        )}

        {step === 'history' && (
          <div className="max-w-4xl mx-auto">
            <h3 className="text-xl font-bold mb-6">Auditoría de Partidos</h3>
            <div className="space-y-4">
              {reportedMatches.length === 0 && <p className="text-slate-500 text-center py-10">Sin partidos jugados.</p>}
              {reportedMatches.map((m: any) => (
                <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-6 flex justify-between items-center">
                  <div>
                    <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-1 rounded uppercase mr-2">{m.groupName}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${m.status === 'approved' ? 'bg-green-100 text-green-700' : m.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {m.status === 'approved' ? 'Confirmado' : m.status === 'rejected' ? 'Rechazado' : 'Pendiente del rival'}
                    </span>
                    <p className="font-bold text-lg mt-3">{m.winnerName} <span className="text-slate-400 font-normal mx-2">derrotó a</span> {m.loserName}</p>
                    <p className="text-sm font-bold text-slate-600">Score: {m.score}</p>
                  </div>
                  <button onClick={() => deleteMatch(m.id)} className="border border-slate-300 text-red-500 px-4 py-2 rounded text-xs font-bold hover:bg-red-50">Borrar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'standings' && (
          <div className="max-w-5xl mx-auto">
             <div className="flex justify-between items-end mb-8">
               <h3 className="text-2xl font-bold text-slate-800">Posiciones (Solo Confirmados)</h3>
               {activeTournament?.endDate && new Date() > new Date(activeTournament.endDate) && (
                 <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded">Torneo Finalizado: Pendientes Auto-Aprobados</span>
               )}
             </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {Object.keys(groups).map((gName) => {
                    const standings = calculateStandings(gName); 
                    return (
                        <div key={gName} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                            <div className="bg-slate-100 p-4 border-b border-slate-200"><h4 className="font-bold">{gName}</h4></div>
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase border-b border-slate-200">
                                    <tr><th className="p-4">Pos</th><th className="p-4">Jugador</th><th className="p-4 text-center">PJ</th><th className="p-4 text-center">PG</th><th className="p-4 text-center">% Games</th><th className="p-4 text-center font-black">PTS</th></tr>
                                </thead>
                                <tbody>
                                    {standings.map((s: any, i: number) => (
                                        <tr key={s.name} className="border-b border-slate-100"><td className="p-4 text-slate-400 font-bold">{i + 1}</td><td className="p-4 font-bold">{s.name}</td><td className="p-4 text-center">{s.PJ}</td><td className="p-4 text-center">{s.PG}</td><td className="p-4 text-center">{s.pctGames.toFixed(1)}%</td><td className="p-4 text-center text-slate-900 font-black text-lg">{s.Pts}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                })}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}