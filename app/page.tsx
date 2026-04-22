"use client";

import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase'; 
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { 
  collection, onSnapshot, query, orderBy, 
  serverTimestamp, doc, setDoc, getDocs, deleteDoc, getDoc, updateDoc, addDoc 
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
  
  // ESTADOS PARA CREACIÓN
  const [newT, setNewT] = useState({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Inscripciones', coverUrl: '' });
  
  // ESTADOS PARA EDICIÓN EN AJUSTES
  const [editT, setEditT] = useState({ name: '', desc: '', category: '3ra' });
  
  const [manualMatch, setManualMatch] = useState({ winnerName: '', loserName: '', groupName: '', type: 'group' });
  const [sets, setSets] = useState({ s1w: '', s1l: '', s2w: '', s2l: '', s3w: '', s3l: '' });
  const [hasThirdSet, setHasThirdSet] = useState(false);
  const [isWO, setIsWO] = useState(false);

  const [search, setSearch] = useState('');
  const [guestName, setGuestName] = useState(''); 
  const [groups, setGroups] = useState<any>({ "Grupo A": [], "Grupo B": [] });
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [scoringRules, setScoringRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: -2, advancingPerGroup: 2 });
  const [editRules, setEditRules] = useState({ win: 3, loss: 0, winWO: 3, lossWO: -2, advancingPerGroup: 2 });

  // ESTADOS PARA EL CROPPER DE IMAGEN
  const [selectedImageFile, setSelectedImageFile] = useState<string | null>(null);
  const [cropConfig, setCropConfig] = useState({ scale: 1, x: 0, y: 0 });
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageTarget, setImageTarget] = useState<'create' | 'edit'>('create');
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, isDragging: false });

  // ESTADOS PARA ARRASTRAR EL ÁRBOL DE LLAVES
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDraggingTree, setIsDraggingTree] = useState(false);
  const [startXTree, setStartXTree] = useState(0);
  const [startYTree, setStartYTree] = useState(0);
  const [scrollLeftTree, setScrollLeftTree] = useState(0);
  const [scrollTopTree, setScrollTopTree] = useState(0);

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
    
    setEditT({ name: activeTournament.name || '', desc: activeTournament.desc || '', category: activeTournament.category || '3ra' });

    const loadConfig = async () => {
      const gDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"));
      if (gDoc.exists() && gDoc.data().structure) setGroups(gDoc.data().structure);
      else setGroups({ "Grupo A": [], "Grupo B": [] });
      
      const rDoc = await getDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"));
      if (rDoc.exists() && rDoc.data().win !== undefined) {
        const rulesFromDb = { advancingPerGroup: 2, ...rDoc.data() } as any;
        setScoringRules(rulesFromDb);
        setEditRules(rulesFromDb);
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

  // =========================================================================
  // MOTOR DE CROPPER (RECORTE DE IMÁGENES) - FIX TYPESCRIPT
  // =========================================================================
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'create' | 'edit') => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSelectedImageFile(url);
      setCropConfig({ scale: 1, x: 0, y: 0 });
      setImageTarget(target);
    }
  };

  const cropAndUploadImage = async (): Promise<string | null> => {
    // 🚨 FIX TYPESCRIPT: Guardamos la referencia segura en una constante antes de la promesa
    const currentImage = imageRef.current;
    if (!currentImage) return null;
    
    setIsUploadingImage(true);

    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 600; canvas.height = 800; // Ratio 3:4 vertical para la app
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Canvas no soportado");

        const ratio = 600 / 240;
        ctx.scale(ratio, ratio);
        ctx.translate(cropConfig.x, cropConfig.y);
        ctx.scale(cropConfig.scale, cropConfig.scale);
        
        // 🚨 FIX TYPESCRIPT: Usamos la constante segura 'currentImage' en lugar de 'imageRef.current'
        ctx.drawImage(currentImage, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) { alert("Error al procesar"); resolve(null); return; }
          const storage = getStorage();
          const fileRef = ref(storage, `tournaments_covers/cover_${Date.now()}.jpg`);
          await uploadBytes(fileRef, blob);
          const downloadUrl = await getDownloadURL(fileRef);
          
          setSelectedImageFile(null);
          setIsUploadingImage(false);
          resolve(downloadUrl);
        }, 'image/jpeg', 0.85);

      } catch (e) {
        alert("Error al subir.");
        setIsUploadingImage(false);
        resolve(null);
      }
    });
  };

  const executeCrop = async () => {
    const url = await cropAndUploadImage();
    if (url) {
      if (imageTarget === 'create') {
        setNewT({ ...newT, coverUrl: url });
      } else if (imageTarget === 'edit' && activeTournament) {
        await updateDoc(doc(db, "tournaments", activeTournament.id), { coverUrl: url });
        setActiveTournament({...activeTournament, coverUrl: url});
        alert("Foto de portada actualizada exitosamente.");
      }
    }
  };

  // =========================================================================
  // CREACIÓN DE TORNEO (PRIVADOS / PÚBLICOS)
  // =========================================================================
  const handleCreateTournament = async () => {
    if (!newT.name || !newT.price) return alert("Faltan datos obligatorios");
    
    const finalCoverUrl = newT.coverUrl.trim() !== '' 
      ? newT.coverUrl 
      : 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=800'; 

    const isPrivateTournament = newT.category === 'RCB' || newT.category === 'CREMA';

    await addDoc(collection(db, "tournaments"), { 
      ...newT, 
      coverUrl: finalCoverUrl,
      isPrivate: isPrivateTournament,
      participantsIds: [], 
      createdAt: serverTimestamp() 
    });
    setIsModalOpen(false);
    setNewT({ name: '', category: '3ra', yape: '', desc: '', price: '', startDate: '', endDate: '', status: 'Inscripciones', coverUrl: '' });
  };

  // =========================================================================
  // AJUSTES: GUARDAR CAMBIOS
  // =========================================================================
  const handleSaveGeneralInfo = async () => {
    if (!editT.name.trim()) return alert("El título no puede estar vacío");
    const isPrivateTournament = editT.category === 'RCB' || editT.category === 'CREMA';
    
    await updateDoc(doc(db, "tournaments", activeTournament.id), { 
      name: editT.name, 
      desc: editT.desc,
      category: editT.category,
      isPrivate: isPrivateTournament
    });
    setActiveTournament({...activeTournament, name: editT.name, desc: editT.desc, category: editT.category, isPrivate: isPrivateTournament});
    alert("Información general actualizada.");
  };

  const handleSaveRulesChanges = async () => {
    await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...editRules, updatedAt: serverTimestamp() }, { merge: true });
    alert("Reglas guardadas y tablas recalculadas.");
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

  const handleFinishTournament = async () => {
    if (!confirm("¿Seguro que deseas finalizar el torneo? Pasará al Historial de la App.")) return;
    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Finalizado' });
    setActiveTournament({...activeTournament, status: 'Finalizado'});
  };

  // =========================================================================
  // LÓGICA DE GRUPOS Y LLAVES
  // =========================================================================
  const handleAddGuest = async () => {
    if (!guestName.trim()) return alert("Escribe el nombre del invitado");
    const newGuest = { name: `${guestName.trim()} (Invitado)`, isGuest: true, createdAt: serverTimestamp() };
    try {
      const docRef = await addDoc(collection(db, "players"), newGuest);
      setAppPlayers([{ id: docRef.id, ...newGuest }, ...appPlayers]);
      setGuestName('');
    } catch(e) { alert("Error al crear invitado"); }
  };
  const handleDeleteGuest = async (guestId: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name}?`)) return;
    try { await deleteDoc(doc(db, "players", guestId)); setAppPlayers(appPlayers.filter(p => p.id !== guestId)); } catch(e) {}
  };
  const handleAddGroup = () => {
    const groupCount = Object.keys(groups).length;
    const newGroupName = `Grupo ${String.fromCharCode(65 + groupCount)}`; 
    if (!groups[newGroupName]) setGroups({ ...groups, [newGroupName]: [] });
    else setGroups({ ...groups, [`Nuevo Grupo ${groupCount + 1}`]: [] });
  };
  const handleRenameGroup = (oldName: string, newName: string) => {
    setEditingGroup(null); const cleanName = newName.trim();
    if (!cleanName || cleanName === oldName || groups[cleanName]) return;
    const newGroups = { ...groups }; newGroups[cleanName] = newGroups[oldName]; delete newGroups[oldName];
    setGroups(newGroups);
  };
  const handleDeleteGroup = (gName: string) => {
    if (groups[gName].length > 0) if (!confirm(`El ${gName} tiene jugadores. ¿Eliminar de todas formas?`)) return;
    const newGroups = { ...groups }; delete newGroups[gName]; setGroups(newGroups);
  };

  const handleGenerateFixture = async () => {
    if (!confirm("Se crearán los partidos y se activará el torneo. ¿Seguro?")) return;
    const matchesRef = collection(db, "tournaments", activeTournament.id, "matches");
    for (const groupName of Object.keys(groups)) {
      const players = groups[groupName];
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          await addDoc(matchesRef, { groupName: groupName, player1: players[i].name, player2: players[j].name, winnerName: '', loserName: '', score: '', status: 'pending', createdAt: serverTimestamp() });
        }
      }
    }
    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Activo' });
    setActiveTournament({...activeTournament, status: 'Activo'});
  };

  const handleGenerateBrackets = async () => {
    const advanceCount = scoringRules.advancingPerGroup || 2;
    if (!confirm(`Pasarán los ${advanceCount} mejores de cada grupo a las Llaves. ¿Continuar?`)) return;
    
    let qualifiedPlayers: any[] = [];
    Object.keys(groups).forEach(gName => {
      const standings = calculateStandings(gName);
      qualifiedPlayers.push(...standings.slice(0, advanceCount));
    });

    if (qualifiedPlayers.length < 2) return alert("No hay suficientes clasificados para crear llaves.");
    qualifiedPlayers.sort((a, b) => b.Pts !== a.Pts ? b.Pts - a.Pts : b.pctGames - a.pctGames);

    const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
    const numMatches = Math.floor(qualifiedPlayers.length / 2);
    
    let roundName = 'Fase Eliminatoria';
    if (numMatches === 8) roundName = 'Octavos de Final';
    if (numMatches === 4) roundName = 'Cuartos de Final';
    if (numMatches === 2) roundName = 'Semifinal';
    if (numMatches === 1) roundName = 'Gran Final';

    for (let i = 0; i < numMatches; i++) {
      const p1 = qualifiedPlayers[i].name;
      const p2 = qualifiedPlayers[qualifiedPlayers.length - 1 - i].name;
      await addDoc(bracketRef, { round: numMatches === 1 ? roundName : `${roundName} ${i+1}`, player1: p1, player2: p2, winnerName: '', loserName: '', score: '', status: 'pending', tier: 1, createdAt: serverTimestamp() });
    }

    if (qualifiedPlayers.length % 2 !== 0) alert(`Aviso: Un jugador clasificó pero no pudo ser emparejado por ser un número impar.`);
    await updateDoc(doc(db, "tournaments", activeTournament.id), { status: 'Fase Final' });
    setActiveTournament({...activeTournament, status: 'Fase Final'});
  };

  const handleAdvanceNextBracketRound = async (latestMatches: any[], maxTier: number) => {
    if (!confirm("¿Generar la siguiente fase con los ganadores actuales?")) return;
    const bracketRef = collection(db, "tournaments", activeTournament.id, "bracket_matches");
    const numMatches = Math.floor(latestMatches.length / 2);
    let roundName = 'Siguiente Ronda'; if (numMatches === 4) roundName = 'Cuartos de Final'; if (numMatches === 2) roundName = 'Semifinal'; if (numMatches === 1) roundName = 'Gran Final';
    for (let i = 0; i < numMatches; i++) {
      const p1 = latestMatches[i * 2].winnerName; const p2 = latestMatches[i * 2 + 1].winnerName;
      await addDoc(bracketRef, { round: numMatches === 1 ? roundName : `${roundName} ${i+1}`, player1: p1, player2: p2, winnerName: '', loserName: '', score: '', status: 'pending', tier: maxTier + 1, createdAt: serverTimestamp() });
    }
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
        const winner = stats[m.winnerName]; const loser = stats[m.loserName];

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

  const handleSetChangeManual = (field: string, value: string, nextFieldId: string | null) => {
    const numericValue = value.replace(/\D/g, '').slice(0, 2);
    setSets(prev => ({ ...prev, [field]: numericValue }));
    if (numericValue.length === 2 && nextFieldId) { document.getElementById(nextFieldId)?.focus(); }
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
        await addDoc(collection(db, "tournaments", activeTournament.id, "matches"), { groupName: manualMatch.groupName, winnerName: manualMatch.winnerName, loserName: manualMatch.loserName, player1: manualMatch.winnerName, player2: manualMatch.loserName, score: finalScore, status: 'approved', createdAt: serverTimestamp() });
      } else {
        await updateDoc(doc(db, "tournaments", activeTournament.id, "bracket_matches", manualMatch.groupName), { winnerName: manualMatch.winnerName, loserName: manualMatch.loserName, score: finalScore, status: 'approved' });
      }
      setIsManualModalOpen(false); resetModal();
    } catch (e) { alert("Error al guardar el resultado."); }
  };

  const resetModal = () => {
    setManualMatch({ winnerName: '', loserName: '', groupName: '', type: 'group' });
    setSets({ s1w: '', s1l: '', s2w: '', s2l: '', s3w: '', s3l: '' });
    setHasThirdSet(false); setIsWO(false);
  };

  const maxTier = bracketMatches.length > 0 ? Math.max(...bracketMatches.map(m => m.tier || 1)) : 1;
  const latestBracketMatches = bracketMatches.filter(m => (m.tier || 1) === maxTier);
  const canAdvanceBracket = latestBracketMatches.length > 1 && latestBracketMatches.every(m => m.status === 'approved');
  const bracketTiers = Array.from(new Set(bracketMatches.map(m => m.tier || 1))).sort((a, b) => a - b);

  const startDragTree = (e: React.MouseEvent) => {
    if (!sliderRef.current) return;
    setIsDraggingTree(true); setStartXTree(e.pageX - sliderRef.current.offsetLeft); setStartYTree(e.pageY - sliderRef.current.offsetTop); setScrollLeftTree(sliderRef.current.scrollLeft); setScrollTopTree(sliderRef.current.scrollTop);
  };
  const stopDragTree = () => setIsDraggingTree(false);
  const onDragTree = (e: React.MouseEvent) => {
    if (!isDraggingTree || !sliderRef.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft; const y = e.pageY - sliderRef.current.offsetTop;
    sliderRef.current.scrollLeft = scrollLeftTree - (x - startXTree) * 1.5; sliderRef.current.scrollTop = scrollTopTree - (y - startYTree) * 1.5;
  };


  // =========================================================================
  // RENDER UI - TEMA VERDE EXCLUSIVO FLAT
  // =========================================================================
  if (authLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p className="font-bold text-green-600 uppercase tracking-widest animate-pulse">Cargando...</p></div>;

  if (!user || !isAdmin) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleLogin} className="bg-white p-10 shadow-lg border border-green-100 w-full max-w-sm rounded-[30px]">
        <h1 className="text-2xl font-black text-center mb-8 text-green-900 tracking-tight">Acceso Master</h1>
        <input type="email" required placeholder="Correo" className="w-full p-4 mb-4 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-green-500 transition" onChange={e => setEmail(e.target.value)} />
        <input type="password" required placeholder="Contraseña" className="w-full p-4 mb-8 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-green-500 transition" onChange={e => setPassword(e.target.value)} />
        <button type="submit" className="w-full bg-green-600 text-white p-4 rounded-xl font-black tracking-widest uppercase hover:bg-green-700 transition">ENTRAR</button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20">
      
      {view === 'main' ? (
        <div className="p-10 max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-10 border-b-2 border-green-100 pb-4">
            <h1 className="text-3xl font-black text-green-900 tracking-tight">Panel de Torneos</h1>
            <button onClick={() => setIsModalOpen(true)} className="bg-green-600 text-white px-6 py-3 rounded-xl font-black text-sm tracking-widest uppercase hover:bg-green-700 transition shadow-md border-b-4 border-green-800">+ NUEVO TORNEO</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {tournaments.map(t => (
              <div key={t.id} className="bg-white rounded-[20px] border-2 border-slate-100 hover:border-green-500 hover:shadow-xl transition-all overflow-hidden flex flex-col group">
                <div className="h-40 bg-slate-200 relative overflow-hidden">
                  <img src={t.coverUrl || 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80&w=800'} alt="Cover" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-3 right-3 bg-black/80 backdrop-blur text-white text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">{t.status}</div>
                </div>
                <div className="p-6 flex flex-col flex-grow">
                  <span className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2">{t.category}</span>
                  <h2 className="text-xl font-black mb-6 text-slate-800 leading-tight">{t.name}</h2>
                  <div className="mt-auto">
                    <button onClick={() => { setActiveTournament(t); setStep('groups'); setView('manage'); }} className="w-full bg-green-50 text-green-700 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest border border-green-100 hover:bg-green-600 hover:text-white transition">Gestionar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-8 max-w-7xl mx-auto">
          <div className="flex items-center gap-4 mb-8 border-b-2 border-green-100 pb-4">
            <button onClick={() => setView('main')} className="text-slate-400 hover:text-green-600 font-black text-2xl px-2 transition">&larr;</button>
            <h2 className="text-3xl font-black text-green-900 tracking-tight">{activeTournament.name}</h2>
            <span className={`text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest ml-4 ${activeTournament.status === 'Inscripciones' ? 'bg-blue-100 text-blue-700' : activeTournament.status === 'Activo' ? 'bg-green-100 text-green-700' : activeTournament.status === 'Finalizado' ? 'bg-slate-200 text-slate-600' : 'bg-purple-100 text-purple-700'}`}>{activeTournament.status}</span>
            <div className="ml-auto flex gap-3">
              {activeTournament.status === 'Inscripciones' && <button onClick={handleGenerateFixture} className="bg-blue-500 text-white px-5 py-2.5 rounded-xl font-black text-xs tracking-widest uppercase hover:bg-blue-600 transition shadow-sm">Generar Fixture &rarr;</button>}
              {activeTournament.status === 'Activo' && <button onClick={handleGenerateBrackets} className="bg-purple-500 text-white px-5 py-2.5 rounded-xl font-black text-xs tracking-widest uppercase hover:bg-purple-600 transition shadow-sm">Crear Llaves &rarr;</button>}
              {(activeTournament.status === 'Fase Final' || activeTournament.status === 'Activo') && <button onClick={handleFinishTournament} className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-black text-xs tracking-widest uppercase hover:bg-black transition shadow-sm">🏁 Finalizar Torneo</button>}
            </div>
          </div>
          
          <div className="bg-white rounded-[30px] border border-slate-100 overflow-hidden shadow-xl">
            <div className="flex bg-slate-50 border-b border-slate-200 overflow-x-auto p-2 gap-2">
               {['groups', 'standings', 'history', 'brackets', 'rules', 'settings'].map(s => (
                 <button key={s} onClick={() => setStep(s)} className={`px-6 py-4 rounded-xl text-[11px] font-black uppercase tracking-widest transition ${step === s ? 'bg-white shadow-sm text-green-700' : 'text-slate-500 hover:text-green-700 hover:bg-white'}`}>
                    {s === 'groups' ? 'Grupos' : s === 'standings' ? 'Posiciones' : s === 'history' ? 'Resultados' : s === 'brackets' ? 'Llaves' : s === 'rules' ? 'Reglas' : 'Ajustes'}
                 </button>
               ))}
            </div>

            <div className="p-8 min-h-[600px] bg-slate-50/50">
              
              {/* === GRUPOS === */}
              {step === 'groups' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-4 lg:border-r border-slate-200 lg:pr-8">
                    <div className="mb-8 p-6 bg-green-50 border border-green-100 rounded-2xl">
                      <h4 className="text-[11px] font-black text-green-700 uppercase mb-3 tracking-widest">Crear Invitado</h4>
                      <div className="flex gap-3">
                        <input type="text" placeholder="Ej: Carlos Perez" className="w-full p-3 rounded-xl border border-white shadow-sm text-sm font-bold outline-none focus:border-green-400" value={guestName} onChange={e => setGuestName(e.target.value)} />
                        <button onClick={handleAddGuest} className="bg-green-600 text-white px-5 rounded-xl font-black text-lg hover:bg-green-700 transition shadow-sm">+</button>
                      </div>
                    </div>
                    <h3 className="font-black text-[11px] uppercase mb-4 text-slate-400 tracking-widest">Base de Jugadores</h3>
                    <input type="text" placeholder="Buscar jugador..." className="w-full p-4 rounded-2xl border-2 border-white shadow-sm mb-6 font-bold outline-none focus:border-green-400 text-sm" onChange={e => setSearch(e.target.value)} />
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                      {appPlayers.filter(p => p.name?.toLowerCase().includes(search.toLowerCase())).map(p => (
                        <div key={p.id} className="p-4 border border-slate-100 rounded-2xl bg-white flex flex-col hover:border-green-200 transition shadow-sm">
                          <div className="flex justify-between items-center w-full">
                            <span className="font-bold text-sm text-slate-700">{p.name}</span>
                            {p.isGuest && <button onClick={() => handleDeleteGuest(p.id, p.name)} className="text-slate-300 hover:text-red-500 text-xs font-black transition uppercase">Borrar</button>}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-50">
                            {Object.keys(groups).map(gName => (
                              <button key={gName} onClick={() => setGroups({...groups, [gName]: [...(groups[gName]||[]), p]})} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black text-slate-500 hover:bg-green-600 hover:text-white hover:border-green-600 uppercase transition tracking-widest">
                                + {gName.substring(0, 8)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="lg:col-span-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {Object.keys(groups).map(g => (
                        <div key={g} className="bg-white p-8 rounded-3xl border border-slate-200 group relative shadow-sm">
                          <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
                            {editingGroup === g ? (
                              <input autoFocus defaultValue={g} onBlur={(e) => handleRenameGroup(g, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameGroup(g, e.currentTarget.value)} className="font-black uppercase text-xl border-b-2 border-green-500 outline-none w-3/4 text-green-700" />
                            ) : (
                              <h4 className="font-black uppercase text-xl text-slate-800 cursor-pointer hover:text-green-600 transition" onClick={() => setEditingGroup(g)}>{g}</h4>
                            )}
                            <button onClick={() => handleDeleteGroup(g)} className="text-slate-300 hover:text-red-500 text-xs font-black uppercase transition">X</button>
                          </div>
                          <div className="space-y-3">
                            {groups[g].length === 0 && <p className="text-slate-400 font-bold text-sm">Grupo vacío</p>}
                            {groups[g].map((p: any) => (
                              <div key={p.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm font-bold flex justify-between items-center text-slate-700">
                                {p.name}
                                <button onClick={() => setGroups({...groups, [g]: groups[g].filter((x:any)=>x.id!==p.id)})} className="text-slate-400 hover:text-red-500 font-black px-2 transition">X</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      
                      <button onClick={handleAddGroup} className="bg-transparent border-2 border-dashed border-slate-300 rounded-3xl flex flex-col items-center justify-center p-8 hover:bg-green-50 hover:border-green-400 transition group min-h-[200px]">
                        <span className="text-4xl font-black text-slate-300 group-hover:text-green-500 mb-3 transition">+</span>
                        <span className="font-black text-slate-400 group-hover:text-green-600 uppercase tracking-widest text-xs transition">Añadir Grupo</span>
                      </button>
                    </div>
                    <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "groups"), {structure: groups}); alert("Guardado."); }} className="mt-10 w-full bg-green-600 text-white rounded-2xl p-5 font-black text-xs tracking-widest uppercase hover:bg-green-700 transition shadow-lg border-b-4 border-green-800">Guardar Estructura</button>
                  </div>
                </div>
              )}

              {/* === REGLAS === */}
              {step === 'rules' && (
                <div className="max-w-4xl mx-auto">
                  <div className="mb-12 pb-8 border-b border-slate-200">
                    <h3 className="text-sm font-black mb-4 uppercase text-slate-800 tracking-wide">Lógica de Clasificación</h3>
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
                      <span className="font-black text-[11px] uppercase tracking-widest text-slate-500">Jugadores que avanzan a Llaves (Por Grupo):</span>
                      <input type="number" min="1" value={scoringRules.advancingPerGroup} onChange={e => setScoringRules({...scoringRules, advancingPerGroup: Number(e.target.value)})} className="w-24 p-3 text-xl font-black border-2 border-slate-100 rounded-xl text-center outline-none focus:border-green-500 text-green-700 bg-slate-50" />
                    </div>
                  </div>

                  <h3 className="text-sm font-black mb-6 uppercase text-slate-800 tracking-wide">Puntuación</h3>
                  <div className="grid grid-cols-2 gap-6 mb-10">
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm"><label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">Puntos Victoria</label><input type="number" value={scoringRules.win} onChange={e => setScoringRules({...scoringRules, win: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 border-slate-50 rounded-xl outline-none focus:border-green-500 text-green-600 transition bg-slate-50" /></div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm"><label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">Puntos Derrota</label><input type="number" value={scoringRules.loss} onChange={e => setScoringRules({...scoringRules, loss: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 border-slate-50 rounded-xl outline-none focus:border-slate-500 text-slate-600 transition bg-slate-50" /></div>
                    <div className="bg-green-50 p-6 rounded-2xl border border-green-100"><label className="block text-[10px] font-black text-green-700 mb-3 uppercase tracking-widest">Victoria W.O.</label><input type="number" value={scoringRules.winWO} onChange={e => setScoringRules({...scoringRules, winWO: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 border-green-200 rounded-xl outline-none focus:border-green-500 bg-white text-green-800 transition" /></div>
                    <div className="bg-red-50 p-6 rounded-2xl border border-red-100"><label className="block text-[10px] font-black text-red-600 mb-3 uppercase tracking-widest">Derrota W.O.</label><input type="number" value={scoringRules.lossWO} onChange={e => setScoringRules({...scoringRules, lossWO: Number(e.target.value)})} className="w-full p-4 text-2xl font-black border-2 border-red-200 rounded-xl outline-none focus:border-red-500 bg-white text-red-600 transition" /></div>
                  </div>
                  <button onClick={async () => { await setDoc(doc(db, "tournaments", activeTournament.id, "configuration", "rules"), { ...scoringRules, updatedAt: serverTimestamp() }, { merge: true }); alert("Reglas guardadas."); }} className="w-full bg-green-600 text-white p-5 rounded-2xl font-black text-[11px] tracking-widest uppercase hover:bg-green-700 transition shadow-lg border-b-4 border-green-800">Guardar y Recalcular Tablas</button>
                </div>
              )}

              {/* === RESULTADOS === */}
              {step === 'history' && (
                <div className="max-w-5xl mx-auto">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black uppercase text-slate-400 text-xs tracking-widest">Monitor de Grupos</h3>
                    <button onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'group'}); setIsManualModalOpen(true); }} className="bg-green-50 text-green-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-100 border border-green-200 transition">+ Registrar Score</button>
                  </div>
                  <div className="space-y-4">
                    {reportedMatches.filter(m => m.status === 'approved' || m.status === 'rival_pending' || m.status === 'rejected').map(m => (
                      <div key={m.id} className={`p-5 rounded-2xl bg-white border-2 flex justify-between items-center transition shadow-sm ${m.status === 'rejected' ? 'border-red-300' : 'border-slate-100'}`}>
                        <div className="flex items-center">
                          <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1.5 rounded uppercase mr-6 tracking-widest">{m.groupName}</span>
                          <span className="font-bold text-base text-slate-800">{m.winnerName} <span className="text-slate-300 mx-3 text-sm font-normal">vs</span> {m.loserName}</span>
                        </div>
                        <div className="flex items-center gap-5">
                          <span className="font-black text-2xl text-slate-700 tracking-tight">{m.score}</span>
                          
                          {m.status === 'rival_pending' && (
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-black text-orange-600 bg-orange-50 px-3 py-1.5 rounded border border-orange-100 uppercase tracking-widest">En Revisión</span>
                              <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id), {status: 'approved'})} className="bg-green-50 text-green-700 border border-green-200 font-black text-[10px] px-4 py-1.5 rounded-lg hover:bg-green-100 transition uppercase tracking-widest">Aprobar</button>
                            </div>
                          )}
                          
                          {m.status === 'rejected' && <button onClick={() => updateDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id), {status: 'approved'})} className="bg-red-500 text-white rounded-lg font-black text-[10px] px-4 py-1.5 uppercase shadow-sm tracking-widest">Forzar Aprobación</button>}

                          <button onClick={() => deleteDoc(doc(db, "tournaments", activeTournament.id, "matches", m.id))} className="text-slate-300 font-black text-lg hover:text-red-500 ml-3 transition">X</button>
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
                          <div key={gName} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-md">
                              <div className="bg-slate-50 p-5 border-b border-slate-100"><h4 className="font-black text-green-900 text-sm uppercase tracking-widest">{gName}</h4></div>
                              <table className="w-full text-left">
                                  <thead className="bg-white text-slate-400 text-[10px] font-black uppercase border-b-2 border-slate-50">
                                      <tr><th className="p-5">Jugador</th><th className="p-5 text-center">PJ</th><th className="p-5 text-center">PG</th><th className="p-5 text-center text-green-600">PTS</th></tr>
                                  </thead>
                                  <tbody>
                                      {standings.map((s: any, i: number) => (
                                          <tr key={s.name} className={`border-b border-slate-50 ${i < scoringRules.advancingPerGroup ? 'bg-green-50/50' : ''}`}>
                                            <td className="p-5 font-bold text-sm text-slate-700">
                                              <span className={`mr-4 font-black ${i < scoringRules.advancingPerGroup ? 'text-green-600' : 'text-slate-300'}`}>{i+1}</span>
                                              {s.name}
                                            </td>
                                            <td className="p-5 text-center font-bold text-slate-400 text-sm">{s.PJ}</td>
                                            <td className="p-5 text-center font-bold text-slate-400 text-sm">{s.PG}</td>
                                            <td className="p-5 text-center font-black text-xl text-green-700">{s.Pts}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      );
                  })}
                </div>
              )}

              {/* === LLAVES (EL ÁRBOL ARRASTRABLE EN WEB) === */}
              {step === 'brackets' && (
                <div className="w-full h-full flex flex-col">
                  <div className="flex justify-between items-center mb-8 border-b-2 border-slate-100 pb-5 shrink-0">
                    <h3 className="font-black uppercase text-slate-400 text-xs tracking-widest">Árbol de Eliminatorias</h3>
                    <div className="flex gap-4">
                      {canAdvanceBracket && (
                        <button onClick={() => handleAdvanceNextBracketRound(latestBracketMatches, maxTier)} className="bg-green-500 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600 shadow-md animate-pulse">🏆 Siguiente Ronda</button>
                      )}
                      <button onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'bracket'}); setIsManualModalOpen(true); }} className="bg-white text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 border-2 border-slate-200 transition shadow-sm">+ Score de Llave</button>
                    </div>
                  </div>
                  
                  <div 
                    ref={sliderRef} onMouseDown={startDragTree} onMouseLeave={stopDragTree} onMouseUp={stopDragTree} onMouseMove={onDragTree}
                    className={`w-full overflow-x-auto overflow-y-hidden bg-white border-2 border-slate-100 rounded-3xl min-h-[500px] select-none shadow-inner ${isDraggingTree ? 'cursor-grabbing' : 'cursor-grab'}`}
                  >
                    <div className="flex items-center min-w-max p-12 h-full">
                      {bracketTiers.map((tier, index) => {
                        const matchesInTier = bracketMatches.filter(m => m.tier === tier);
                        return (
                          <div key={tier} className="flex flex-col justify-around min-w-[280px] h-full gap-10 mr-20 relative">
                            {matchesInTier.map((bm, i) => (
                              <div key={bm.id} className="relative z-10 group">
                                <div onClick={() => { resetModal(); setManualMatch({...manualMatch, type: 'bracket', groupName: bm.id, winnerName: bm.player1, loserName: bm.player2}); setIsManualModalOpen(true); }} className="bg-white border-2 border-slate-100 rounded-2xl p-5 shadow-sm hover:border-green-400 hover:shadow-lg transition cursor-pointer">
                                  <h4 className="font-black text-slate-400 text-[10px] uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">{bm.round}</h4>
                                  <div className={`p-3 rounded-xl border-2 mb-3 font-bold text-sm flex justify-between transition ${bm.winnerName === bm.player1 ? 'border-green-200 bg-green-50 text-green-800' : 'border-transparent bg-slate-50 text-slate-700'}`}>
                                    <span>{bm.player1}</span> {bm.winnerName === bm.player1 && <span className="text-green-500 font-black">✓</span>}
                                  </div>
                                  <div className={`p-3 rounded-xl border-2 font-bold text-sm flex justify-between transition ${bm.winnerName === bm.player2 ? 'border-green-200 bg-green-50 text-green-800' : 'border-transparent bg-slate-50 text-slate-700'}`}>
                                    <span>{bm.player2}</span> {bm.winnerName === bm.player2 && <span className="text-green-500 font-black">✓</span>}
                                  </div>
                                  <div className="mt-5 text-center font-black text-xl text-slate-800 tracking-tight">{bm.status === 'approved' ? bm.score : <span className="text-orange-400 text-[10px] uppercase tracking-widest">Pendiente</span>}</div>
                                </div>
                                {index < bracketTiers.length - 1 && <div className="absolute top-1/2 -right-20 w-20 h-[3px] bg-slate-200 -z-10 group-hover:bg-green-400 transition-colors duration-300 rounded-full"></div>}
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {bracketTiers.length > 0 && bracketMatches.find(m => m.tier === Math.max(...bracketTiers))?.status === 'approved' && (
                        <div className="flex flex-col items-center justify-center min-w-[200px] ml-10">
                          <div className="bg-amber-100 p-6 rounded-full mb-6 shadow-xl border-4 border-amber-300">
                            <span className="text-6xl">🏆</span>
                          </div>
                          <span className="font-black text-3xl text-slate-800 uppercase tracking-widest text-center">{bracketMatches.find(m => m.tier === Math.max(...bracketTiers))?.winnerName}</span>
                          <span className="text-xs font-black text-green-600 mt-3 uppercase tracking-widest bg-green-50 px-4 py-2 rounded-full">Campeón del Torneo</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* === AJUSTES (COMPLETAMENTE RENOVADO Y ESTRUCTURADO) === */}
              {step === 'settings' && (
                <div className="max-w-5xl mx-auto space-y-10 pb-16">
                  
                  {/* BLOQUE 1: INFORMACIÓN GENERAL */}
                  <div className="bg-white p-10 rounded-[30px] border-2 border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black mb-8 text-green-900 uppercase tracking-widest border-b-2 border-green-50 pb-4">Información General</h3>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Título del Torneo</label>
                        <input type="text" value={editT.name} onChange={e => setEditT({ ...editT, name: e.target.value })} className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 transition" />
                      </div>
                      <div className="flex gap-4">
                        <div className="w-1/2">
                          <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Categoría</label>
                          <select className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 text-slate-700 transition cursor-pointer" value={editT.category} onChange={e => setEditT({...editT, category: e.target.value})}>
                            <optgroup label="Categorías Públicas">
                              <option value="3ra">3ra Categoría</option>
                              <option value="4ta">4ta Categoría</option>
                              <option value="5ta A">5ta A</option>
                              <option value="5ta B">5ta B</option>
                            </optgroup>
                            <optgroup label="Privados / Exclusivos">
                              <option value="RCB">Copa RCB</option>
                              <option value="CREMA">Raqueta CREMA</option>
                            </optgroup>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Descripción Interna</label>
                        <textarea value={editT.desc} onChange={e => setEditT({ ...editT, desc: e.target.value })} placeholder="Escribe notas o reglas adicionales aquí..." className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 transition h-32 resize-none" />
                      </div>
                    </div>
                    <button onClick={handleSaveGeneralInfo} className="mt-8 bg-green-600 text-white px-8 py-4 rounded-xl font-black text-[11px] tracking-widest uppercase hover:bg-green-700 transition shadow-sm border-b-4 border-green-800">Guardar Cambios Generales</button>
                  </div>

                  {/* BLOQUE 2: REGLAS */}
                  <div className="bg-white p-10 rounded-[30px] border-2 border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black mb-8 text-green-900 uppercase tracking-widest border-b-2 border-green-50 pb-4">Editar Reglas Internas</h3>
                    <div className="grid grid-cols-2 gap-6 mb-10">
                      <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100"><label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">Puntos Victoria</label><input type="number" value={editRules.win} onChange={e => setEditRules({...editRules, win: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 border-white rounded-xl outline-none focus:border-green-500 text-green-600 transition" /></div>
                      <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100"><label className="block text-[10px] font-black text-slate-400 mb-3 uppercase tracking-widest">Puntos Derrota</label><input type="number" value={editRules.loss} onChange={e => setEditRules({...editRules, loss: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 border-white rounded-xl outline-none focus:border-slate-500 text-slate-600 transition" /></div>
                      <div className="bg-green-50 p-6 rounded-2xl border-2 border-green-100"><label className="block text-[10px] font-black text-green-700 mb-3 uppercase tracking-widest">Victoria W.O.</label><input type="number" value={editRules.winWO} onChange={e => setEditRules({...editRules, winWO: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 border-white rounded-xl outline-none focus:border-green-500 text-green-800 transition" /></div>
                      <div className="bg-red-50 p-6 rounded-2xl border-2 border-red-100"><label className="block text-[10px] font-black text-red-600 mb-3 uppercase tracking-widest">Derrota W.O.</label><input type="number" value={editRules.lossWO} onChange={e => setEditRules({...editRules, lossWO: Number(e.target.value)})} className="w-full p-4 text-xl font-black border-2 border-white rounded-xl outline-none focus:border-red-500 text-red-600 transition" /></div>
                      <div className="col-span-2 bg-white p-6 rounded-2xl border-2 border-slate-100 flex justify-between items-center">
                        <span className="font-black text-[11px] uppercase tracking-widest text-slate-500">Clasificados por Grupo (Pasan a Llaves):</span>
                        <input type="number" min="1" value={editRules.advancingPerGroup} onChange={e => setEditRules({...editRules, advancingPerGroup: Number(e.target.value)})} className="w-24 p-3 text-xl font-black border-2 border-slate-100 rounded-xl text-center outline-none focus:border-green-500 text-green-700 bg-slate-50" />
                      </div>
                    </div>
                    <button onClick={handleSaveRulesChanges} className="bg-green-600 text-white px-8 py-4 rounded-xl font-black text-[11px] tracking-widest uppercase hover:bg-green-700 transition shadow-sm border-b-4 border-green-800">Guardar y Recalcular Tablas</button>
                  </div>

                  {/* BLOQUE 3: FOTO DE PORTADA CON CROPPER INTEGRADO */}
                  <div className="bg-white p-10 rounded-[30px] border-2 border-slate-100 shadow-sm">
                    <h3 className="text-lg font-black mb-8 text-green-900 uppercase tracking-widest border-b-2 border-green-50 pb-4">Cambiar Foto de Portada</h3>
                    <div className="flex flex-col md:flex-row gap-10 items-start">
                      
                      <div className="bg-white rounded-[20px] border-2 border-slate-100 p-6 flex flex-col group w-[240px] shadow-md flex-shrink-0">
                        <div className="h-40 bg-slate-200 relative overflow-hidden rounded-t-[16px]">
                          <img src={activeTournament.coverUrl || 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80'} alt="Current Cover" className="w-full h-full object-cover" />
                          <div className="absolute top-3 right-3 bg-black/80 backdrop-blur text-white text-[10px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">{activeTournament.status}</div>
                        </div>
                        <div className="p-6 flex flex-col flex-grow">
                          <span className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-2">{activeTournament.category}</span>
                          <h2 className="text-xl font-black text-slate-800 leading-tight">{editT.name || activeTournament.name}</h2>
                        </div>
                      </div>
                      
                      <div className="flex-grow w-full border-2 border-dashed border-slate-200 p-8 rounded-3xl bg-slate-50">
                        {selectedImageFile && imageTarget === 'edit' ? (
                          <div className="space-y-6">
                            <p className="text-[10px] text-center font-bold text-slate-400 uppercase tracking-widest mb-4">Ajusta tu nueva portada</p>
                            <div 
                              className="w-[240px] h-[320px] mx-auto overflow-hidden relative rounded-2xl shadow-inner bg-slate-100 cursor-move border-4 border-green-100"
                              onMouseDown={e => { dragRef.current = { startX: e.clientX - cropConfig.x, startY: e.clientY - cropConfig.y, isDragging: true }; }}
                              onMouseMove={e => { if(dragRef.current.isDragging) setCropConfig({...cropConfig, x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY}); }}
                              onMouseUp={() => dragRef.current.isDragging = false}
                              onMouseLeave={() => dragRef.current.isDragging = false}
                            >
                              <img ref={imageRef} src={selectedImageFile} alt="Preview Edit" draggable={false} style={{ transform: `translate(${cropConfig.x}px, ${cropConfig.y}px) scale(${cropConfig.scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
                            </div>
                            <input type="range" min="0.1" max="3" step="0.05" value={cropConfig.scale} onChange={e => setCropConfig({...cropConfig, scale: parseFloat(e.target.value)})} className="w-full max-w-[240px] mx-auto block accent-green-600" />
                            
                            <div className="flex gap-3 justify-center pt-4">
                              <button onClick={() => setSelectedImageFile(null)} className="px-6 py-3 rounded-xl border-2 border-slate-200 font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-white transition">Cancelar</button>
                              <button onClick={executeCrop} disabled={isUploadingImage} className="px-6 py-3 rounded-xl bg-green-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-green-700 transition shadow-sm border-b-4 border-green-800 disabled:opacity-50">
                                {isUploadingImage ? 'Procesando...' : 'Guardar Nueva Portada'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full h-full min-h-[200px] flex flex-col items-center justify-center">
                            <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'edit')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-2xl mb-4">📸</div>
                            <span className="font-black text-slate-500 uppercase tracking-widest text-xs">Toca para elegir una foto de tu PC</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* BLOQUE 4: ZONA RESTRINGIDA (ELIMINAR TORNEO) */}
                  <div className="bg-red-50 p-12 rounded-[30px] border-2 border-red-100 text-center shadow-inner">
                    <h3 className="text-xl font-black mb-3 uppercase tracking-widest text-red-700">Zona Restringida</h3>
                    <p className="text-red-900 font-bold text-sm mb-10">¡Peligro! Eliminarás este torneo, sus partidos, grupos y llaves de forma permanente.</p>
                    <button onClick={handleDeleteFullTournament} className="w-full max-w-sm mx-auto bg-red-600 text-white p-5 rounded-2xl font-black text-[11px] tracking-widest uppercase hover:bg-red-700 transition shadow-md border-b-4 border-red-800 flex justify-center items-center gap-2">
                       ELIMINAR TORNEO
                    </button>
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL CREAR TORNEO (PÚBLICO/PRIVADO) + CROPPER PREVIEW APP
          ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white p-10 w-full max-w-4xl rounded-[30px] shadow-2xl border-2 border-white flex flex-col md:flex-row gap-10 items-start">
            
            <div className="w-full md:w-1/2 space-y-6">
              <h2 className="text-2xl font-black mb-6 uppercase tracking-widest text-green-900 border-b-2 border-green-50 pb-4">Nuevo Torneo</h2>
              
              {selectedImageFile && imageTarget === 'create' ? (
                <div className="space-y-6 bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                  <p className="text-[10px] text-center font-bold text-slate-400 uppercase tracking-widest">Arrastra la imagen o usa Zoom</p>
                  <input type="range" min="0.1" max="3" step="0.05" value={cropConfig.scale} onChange={e => setCropConfig({...cropConfig, scale: parseFloat(e.target.value)})} className="w-full accent-green-600" />
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setSelectedImageFile(null)} className="flex-1 p-3 rounded-xl border-2 border-slate-200 font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-white transition">Atrás</button>
                    <button onClick={executeCrop} disabled={isUploadingImage} className="flex-1 p-3 rounded-xl bg-green-600 text-white font-black text-[10px] uppercase tracking-widest hover:bg-green-700 transition shadow-sm border-b-4 border-green-800 disabled:opacity-50">
                      {isUploadingImage ? '...' : 'Usar Portada'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Nombre del Torneo</label>
                    <input type="text" placeholder="Ej: Copa Verano" className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 transition" onChange={e => setNewT({...newT, name: e.target.value})} />
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Inscripción</label>
                      <input type="number" placeholder="S/ Precio" className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 transition" onChange={e => setNewT({...newT, price: e.target.value})} />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Categoría</label>
                      <select className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 text-slate-700 transition cursor-pointer" value={newT.category} onChange={e => setNewT({...newT, category: e.target.value})}>
                        <optgroup label="Categorías Públicas">
                          <option value="3ra">3ra Categoría</option>
                          <option value="4ta">4ta Categoría</option>
                          <option value="5ta A">5ta A</option>
                          <option value="5ta B">5ta B</option>
                        </optgroup>
                        <optgroup label="Privados / Exclusivos">
                          <option value="RCB">Copa RCB</option>
                          <option value="CREMA">Raqueta CREMA</option>
                        </optgroup>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Foto de Portada</label>
                    <div className="relative w-full">
                      <input type="file" accept="image/*" onChange={(e) => handleFileSelect(e, 'create')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                      <div className={`w-full p-5 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition ${newT.coverUrl ? 'border-green-400 bg-green-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}>
                        <span className="text-2xl">📸</span>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${newT.coverUrl ? 'text-green-700' : 'text-slate-500'}`}>{newT.coverUrl ? '¡Portada Lista! (Toca para cambiar)' : 'Toca para elegir imagen...'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-6 border-t-2 border-slate-50">
                    <button onClick={() => setIsModalOpen(false)} className="flex-1 p-4 rounded-xl border-2 border-slate-100 font-black text-[11px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition">Cancelar</button>
                    <button onClick={handleCreateTournament} className="flex-1 p-4 rounded-xl bg-green-600 text-white font-black text-[11px] uppercase tracking-widest hover:bg-green-700 transition shadow-sm border-b-4 border-green-800">Crear Torneo</button>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full md:w-1/2 flex flex-col items-center justify-center bg-slate-50 rounded-3xl border-2 border-slate-100 p-8 relative">
               <span className="absolute top-4 left-4 text-[9px] font-black text-slate-300 uppercase tracking-widest">Previsualización App</span>
               
               {selectedImageFile && imageTarget === 'create' ? (
                 <div 
                   className="w-[240px] h-[320px] mx-auto overflow-hidden relative rounded-[20px] shadow-lg bg-slate-200 cursor-move border-4 border-green-400"
                   onMouseDown={e => { dragRef.current = { startX: e.clientX - cropConfig.x, startY: e.clientY - cropConfig.y, isDragging: true }; }}
                   onMouseMove={e => { if(dragRef.current.isDragging) setCropConfig({...cropConfig, x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY}); }}
                   onMouseUp={() => dragRef.current.isDragging = false}
                   onMouseLeave={() => dragRef.current.isDragging = false}
                 >
                   <img ref={imageRef} src={selectedImageFile} alt="Preview Crop" draggable={false} style={{ transform: `translate(${cropConfig.x}px, ${cropConfig.y}px) scale(${cropConfig.scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
                 </div>
               ) : (
                 <div className="bg-white rounded-[20px] border-2 border-slate-100 flex flex-col group w-[240px] shadow-xl overflow-hidden transition-all transform scale-105">
                   <div className="h-40 bg-slate-200 relative overflow-hidden">
                     <img src={newT.coverUrl || 'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?q=80'} alt="Preview" className="w-full h-full object-cover" />
                     <div className="absolute top-3 right-3 bg-black/80 backdrop-blur text-white text-[9px] font-black px-3 py-1.5 rounded-md uppercase tracking-widest">Inscripciones</div>
                   </div>
                   <div className="p-5 flex flex-col bg-white">
                     <span className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1.5">{newT.category}</span>
                     <h2 className="text-lg font-black text-slate-800 leading-tight mb-4 truncate">{newT.name || 'Nombre del Torneo...'}</h2>
                     <button disabled className="w-full bg-slate-50 text-green-700 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border border-slate-200 opacity-70">Gestionar</button>
                   </div>
                 </div>
               )}
            </div>

          </div>
        </div>
      )}

      {/* MODAL MANUAL RESULTADOS ADMIN */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-10 w-full max-w-lg rounded-[30px] shadow-2xl border-2 border-white">
            <h2 className="text-lg font-black mb-8 text-center uppercase tracking-widest border-b-2 border-green-50 pb-4 text-green-900">
              {manualMatch.type === 'bracket' ? 'Score de Eliminatoria' : 'Score de Grupo'}
            </h2>
            
            <div className="space-y-6">
              {manualMatch.type === 'bracket' ? (
                <>
                  <select className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 text-slate-700 transition" value={manualMatch.groupName} onChange={e => {
                    const match = bracketMatches.find(bm => bm.id === e.target.value);
                    if(match) setManualMatch({...manualMatch, groupName: match.id, winnerName: match.player1, loserName: match.player2});
                  }}>
                     <option value="">Seleccionar Llave Pendiente...</option>
                     {bracketMatches.filter(bm => bm.status !== 'approved').map(bm => <option key={bm.id} value={bm.id}>{bm.round}: {bm.player1} vs {bm.player2}</option>)}
                  </select>

                  {manualMatch.groupName && (
                    <div className="grid grid-cols-2 gap-4 bg-green-50 p-5 rounded-2xl border border-green-100">
                      <div>
                        <label className="block text-[9px] font-black text-green-600 mb-2 uppercase tracking-widest">Ganador</label>
                        <select className="w-full p-3 rounded-xl border-2 border-green-200 font-bold text-sm outline-none focus:border-green-500 text-green-800 bg-white shadow-sm" value={manualMatch.winnerName} onChange={e => {
                            const m = bracketMatches.find(bm => bm.id === manualMatch.groupName);
                            const l = m.player1 === e.target.value ? m.player2 : m.player1;
                            setManualMatch({...manualMatch, winnerName: e.target.value, loserName: l});
                        }}>
                           <option value={bracketMatches.find(bm => bm.id === manualMatch.groupName)?.player1}>{bracketMatches.find(bm => bm.id === manualMatch.groupName)?.player1}</option>
                           <option value={bracketMatches.find(bm => bm.id === manualMatch.groupName)?.player2}>{bracketMatches.find(bm => bm.id === manualMatch.groupName)?.player2}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 mb-2 uppercase tracking-widest">Perdedor</label>
                        <div className="w-full p-3 rounded-xl border-2 border-slate-100 font-bold text-sm bg-slate-100 text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap">{manualMatch.loserName}</div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <select className="w-full p-4 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 bg-slate-50 text-slate-700 transition" value={manualMatch.groupName} onChange={e => { resetModal(); setManualMatch({...manualMatch, type: 'group', groupName: e.target.value}); }}>
                     <option value="">Seleccionar Grupo...</option>
                     {Object.keys(groups).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>

                  {manualMatch.groupName && (
                    <div className="grid grid-cols-2 gap-4 bg-green-50 p-5 rounded-2xl border border-green-100">
                      <div>
                        <label className="block text-[9px] font-black text-green-600 mb-2 uppercase tracking-widest">Ganador</label>
                        <select className="w-full p-3 rounded-xl border-2 border-green-200 font-bold text-sm outline-none focus:border-green-500 text-green-800 bg-white shadow-sm" value={manualMatch.winnerName} onChange={e => {
                          const l = groups[manualMatch.groupName].find((p:any) => p.name !== e.target.value)?.name || '';
                          setManualMatch({...manualMatch, winnerName: e.target.value, loserName: manualMatch.loserName === e.target.value ? l : manualMatch.loserName});
                        }}>
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-black text-slate-400 mb-2 uppercase tracking-widest">Perdedor</label>
                        <select className="w-full p-3 rounded-xl border-2 border-slate-100 font-bold text-sm outline-none focus:border-green-500 text-slate-600 bg-white shadow-sm" value={manualMatch.loserName} onChange={e => setManualMatch({...manualMatch, loserName: e.target.value})}>
                           <option value="">Jugador...</option>
                           {groups[manualMatch.groupName]?.filter((p:any) => p.name !== manualMatch.winnerName).map((p:any) => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}
              
              {/* TOGGLE W.O. */}
              <div className="flex items-center justify-between p-5 bg-amber-50 rounded-2xl border-2 border-amber-100">
                <span className="font-black text-xs uppercase tracking-widest text-amber-700">Victoria por W.O.</span>
                <input type="checkbox" checked={isWO} onChange={e => setIsWO(e.target.checked)} className="w-6 h-6 accent-amber-500 rounded cursor-pointer" />
              </div>

              {/* CASILLAS NUMÉRICAS */}
              {!isWO && (
                <div className="bg-slate-50 p-6 rounded-2xl border-2 border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 text-center uppercase mb-6 tracking-widest">Score Exacto</p>
                  
                  {/* SET 1 */}
                  <div className="flex items-center justify-center gap-4 mb-5">
                    <span className="font-black text-slate-400 w-12 text-right text-[11px] uppercase tracking-wider">Set 1</span>
                    <input id="s1w" value={sets.s1w} onChange={e => handleSetChangeManual('s1w', e.target.value, 's1l')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500 text-slate-700 transition shadow-sm" />
                    <span className="font-black text-slate-300">-</span>
                    <input id="s1l" value={sets.s1l} onChange={e => handleSetChangeManual('s1l', e.target.value, 's2w')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500 text-slate-700 transition shadow-sm" />
                  </div>
                  
                  {/* SET 2 */}
                  <div className="flex items-center justify-center gap-4 mb-6">
                    <span className="font-black text-slate-400 w-12 text-right text-[11px] uppercase tracking-wider">Set 2</span>
                    <input id="s2w" value={sets.s2w} onChange={e => handleSetChangeManual('s2w', e.target.value, 's2l')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500 text-slate-700 transition shadow-sm" />
                    <span className="font-black text-slate-300">-</span>
                    <input id="s2l" value={sets.s2l} onChange={e => handleSetChangeManual('s2l', e.target.value, hasThirdSet ? 's3w' : null)} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500 text-slate-700 transition shadow-sm" />
                  </div>

                  {/* TOGGLE 3ER SET */}
                  <div className="flex items-center justify-between mb-6 border-t-2 border-slate-100 pt-5">
                    <span className="font-black text-slate-500 text-[10px] uppercase tracking-widest">Super Tie-break (3er Set)</span>
                    <input type="checkbox" checked={hasThirdSet} onChange={e => { setHasThirdSet(e.target.checked); if(e.target.checked) setTimeout(()=>document.getElementById('s3w')?.focus(), 100); }} className="w-5 h-5 accent-green-500 rounded cursor-pointer" />
                  </div>

                  {/* SET 3 */}
                  {hasThirdSet && (
                    <div className="flex items-center justify-center gap-4">
                      <span className="font-black text-slate-400 w-12 text-right text-[11px] uppercase tracking-wider">Set 3</span>
                      <input id="s3w" value={sets.s3w} onChange={e => handleSetChangeManual('s3w', e.target.value, 's3l')} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500 text-slate-700 transition shadow-sm" />
                      <span className="font-black text-slate-300">-</span>
                      <input id="s3l" value={sets.s3l} onChange={e => handleSetChangeManual('s3l', e.target.value, null)} className="w-14 h-14 text-center text-xl font-black rounded-xl border-2 border-slate-200 outline-none focus:border-green-500 text-slate-700 transition shadow-sm" />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-4 mt-8 pt-6 border-t-2 border-slate-50">
              <button onClick={() => setIsManualModalOpen(false)} className="flex-1 p-4 rounded-xl border-2 border-slate-100 font-black text-[11px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={handleAddManualMatch} className="flex-1 p-4 rounded-xl bg-green-600 text-white font-black text-[11px] uppercase tracking-widest hover:bg-green-700 transition shadow-sm border-b-4 border-green-800">Guardar Score</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}