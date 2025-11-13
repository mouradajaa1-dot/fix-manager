import React, { useState, useEffect, useRef, createContext, useContext, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  setLogLevel,
  limit,
  or,
  arrayUnion,
  arrayContains
} from 'firebase/firestore';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Sector 
} from 'recharts';
import { 
  LayoutDashboard, Wrench, Users, DollarSign, Plus, LogOut, 
  ChevronDown, ChevronRight, MoreVertical, Trash2, Edit, CheckSquare, 
  Printer, Share2, X, AlertCircle, Copy, Send, Truck, Package, 
  Archive, Handshake, Lock, Eye, EyeOff, Building, User, UserPlus, 
  History, Calendar, Settings, Contact, ClipboardCopy, Mail,
  Megaphone,
  ArrowLeft,
  UserSquare,
  Smartphone,
  Info,
  Book,
  ShieldCheck,
  Clock,
  CreditCard,
  BatteryCharging,
  Droplet,
  MicOff,
  Speaker,
  CameraOff,
  WifiOff,
  ScreenShare,
  FileText,
  Receipt
} from 'lucide-react';

// --- CONFIGURAZIONE FIREBASE ---
// Leggiamo la configurazione dalle Variabili d'Ambiente
// VITE_FIREBASE_CONFIG_JSON è il nome della variabile che creeremo in Vercel.
const firebaseConfigJson = import.meta.env.VITE_FIREBASE_CONFIG_JSON;
let firebaseConfig = {};

if (firebaseConfigJson) {
  try {
    firebaseConfig = JSON.parse(firebaseConfigJson);
  } catch (e) {
    console.error("Errore nel parsing della configurazione Firebase dalle variabili d'ambiente", e);
  }
} else {
  console.error("Variabile d'ambiente VITE_FIREBASE_CONFIG_JSON non trovata!");
}

const appId = firebaseConfig.projectId || 'default-app-id';

let db;
let auth;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // setLogLevel('debug'); 
} catch (e) {
  console.error("Errore inizializzazione Firebase:", e);
}

// --- CONTESTO AUTENTICAZIONE ---
const AuthContext = createContext(null);

const useAuth = () => {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // Utente Firebase
  const [appUser, setAppUser] = useState(null); // Utente (Owner/Admin/Tecnico)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dbUserRef, setDbUserRef] = useState(null);

  useEffect(() => {
    // Usiamo solo l'accesso anonimo
    const performAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Errore di autenticazione anonima:", e);
        setError("Errore di autenticazione.");
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        const userRef = doc(db, `artifacts/${appId}/users/${user.uid}`);
        setDbUserRef(userRef);
        
        // Verifica se l'utente è loggato nell'app
        const appLoginData = await getDoc(doc(userRef, 'state', 'appLogin'));
        if (appLoginData.exists() && appLoginData.data().loggedIn) {
          setAppUser(appLoginData.data().user);
        }
        
        // Inizializza utenti di default se non esistono
        await initializeDefaultUsers(user.uid);
        
      } else {
        setCurrentUser(null);
        setAppUser(null);
      }
      setAuthReady(true);
      setLoading(false);
    });

    performAuth();
    return () => unsubscribe();
  }, []);

  // Funzione per inizializzare gli utenti di default (OWNER + TECNICO)
  const initializeDefaultUsers = async (userId) => {
    const ownerRef = doc(db, `artifacts/${appId}/users/${userId}/managedUsers`, 'owner');
    const techRef = doc(db, `artifacts/${appId}/users/${userId}/managedUsers`, 'tecnico');
    
    try {
      const ownerDoc = await getDoc(ownerRef);
      if (!ownerDoc.exists()) {
        await setDoc(ownerRef, {
          id: 'owner',
          username: 'owner',
          password: 'owner', // In un'app reale, questo dovrebbe essere hashato
          role: 'Owner',
          permissions: ['all']
        });
      }
      
      const techDoc = await getDoc(techRef);
      if (!techDoc.exists()) {
        await setDoc(techRef, {
          id: 'tecnico',
          username: 'tecnico',
          password: 'password', // Semplice password di default
          role: 'Technician',
          permissions: ['view_repairs', 'edit_repairs']
        });
      }
    } catch (e) {
      console.error("Errore nell'inizializzare gli utenti di default:", e);
    }
  };

  // Funzione di Login
  const login = async (username, password) => {
    if (!dbUserRef) {
      setError("Connessione non pronta.");
      return;
    }
    setLoading(true);
    setError('');
    
    try {
      const usersCol = collection(dbUserRef, 'managedUsers');
      const q = query(usersCol, where("username", "==", username));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError("Utente non trovato.");
        setLoading(false);
        return;
      }
      
      let userFound = null;
      querySnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.password === password) { // Controllo password in chiaro (non sicuro per produzione)
          userFound = userData;
        }
      });
      
      if (userFound) {
        setAppUser(userFound);
        // Salva lo stato di login
        await setDoc(doc(dbUserRef, 'state', 'appLogin'), {
          loggedIn: true,
          user: userFound
        });
      } else {
        setError("Password errata.");
      }
    } catch (e) {
      console.error("Errore durante il login:", e);
      setError("Si è verificato un errore.");
    }
    setLoading(false);
  };

  // Funzione di Logout
  const logout = async () => {
    setAppUser(null);
    if (dbUserRef) {
      try {
        await setDoc(doc(dbUserRef, 'state', 'appLogin'), {
          loggedIn: false,
          user: null
        });
      } catch (e) {
        console.error("Errore durante il logout:", e);
      }
    }
  };

  // Ritorna i valori del contesto
  return { authReady, appUser, loading, error, login, logout, dbUserRef };
};
// --- FINE hook useAuth ---


// --- SCHERMATA DI LOGIN ---
const LoginScreen = ({ onLogin, error, loading }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!loading) {
      onLogin(username, password);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-sm p-8 bg-white rounded-lg shadow-xl">
        <div className="flex justify-center mb-6">
          <Wrench className="w-12 h-12 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-4">FixManager</h2>
        <p className="text-center text-gray-500 mb-6">Accedi al tuo gestionale</p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
              Utente
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="es. owner"
              autoComplete="username"
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="shadow-sm appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="************"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                style={{top: '-0.375rem'}} // Aggiusta allineamento verticale
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          
          {error && (
            <p className="text-red-500 text-sm italic text-center mb-4">{error}</p>
          )}

          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-colors duration-200 disabled:bg-gray-400"
            >
              {loading ? 'Caricamento...' : 'Accedi'}
            </button>
          </div>
        </form>
        <p className="text-center text-xs text-gray-400 mt-8">
          Utenti predefiniti: (owner / owner) o (tecnico / password)
        </p>
      </div>
    </div>
  );
};


// --- COMPONENTI UI GENERICI ---

// Icone (centralizzate)
const ICONS = {
  Dashboard: <LayoutDashboard size={20} />,
  Repairs: <Wrench size={20} />,
  Customers: <Users size={20} />,
  Finance: <DollarSign size={20} />,
  Settings: <Settings size={20} />,
  Logout: <LogOut size={20} />,
  Queue: <History size={20} />,
  Working: <Wrench size={20} />, // Icona duplicata, ma con senso
  Ready: <CheckSquare size={20} />,
  Delivered: <Handshake size={20} />,
  Archived: <Archive size={20} />,
  NewRepair: <Plus size={16} />,
  NewCustomer: <UserPlus size={16} />,
  NewMovement: <Plus size={16} />,
  Print: <Printer size={16} />,
  Share: <Share2 size={16} />,
  POS: <Receipt size={16} />,
  Edit: <Edit size={16} />,
  Delete: <Trash2 size={16} />,
  Back: <ArrowLeft size={16} />,
  Customer: <UserSquare size={16} />,
  Device: <Smartphone size={16} />,
  Info: <Info size={16} />,
  Notes: <Book size={16} />,
  Warranty: <ShieldCheck size={16} />,
  Arrival: <Clock size={16} />,
  Deposit: <CreditCard size={16} />,
  Problems: <AlertCircle size={16} />,
  Close: <X size={20} />,
  Copy: <ClipboardCopy size={16} />,
  Send: <Send size={16} />,
  Details: <FileText size={16} />,
};

// Sidebar
const Sidebar = ({ currentView, onNavigate, onLogout, appUser }) => {
  const navItems = [
    { name: 'Dashboard', icon: ICONS.Dashboard },
    { name: 'Riparazioni', icon: ICONS.Repairs },
    { name: 'Clienti', icon: ICONS.Customers },
    { name: 'Finanze', icon: ICONS.Finance },
    { name: 'Impostazioni', icon: ICONS.Settings, adminOnly: true },
  ];

  const canView = (item) => {
    if (!item.adminOnly) return true;
    return appUser.role === 'Owner' || appUser.permissions.includes('all');
  };

  return (
    <div className="w-64 h-screen bg-gray-900 text-gray-200 flex flex-col fixed top-0 left-0">
      <div className="p-5 text-center border-b border-gray-700">
        <h1 className="text-2xl font-bold text-white">FixManager</h1>
      </div>
      <nav className="flex-1 mt-6">
        {navItems.filter(canView).map((item) => (
          <a
            key={item.name}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onNavigate(item.name);
            }}
            className={`flex items-center px-6 py-4 text-sm font-medium ${
              currentView === item.name
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            } transition-colors duration-150`}
          >
            <span className="mr-3">{item.icon}</span>
            {item.name}
          </a>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <div className="px-2 py-2 text-sm">
          <p className="font-semibold text-white">{appUser.username}</p>
          <p className="text-xs text-gray-400">{appUser.role}</p>
        </div>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onLogout();
          }}
          className="flex items-center w-full px-6 py-4 text-sm font-medium text-red-400 hover:bg-gray-700 hover:text-red-300 rounded-md transition-colors duration-150"
        >
          <span className="mr-3">{ICONS.Logout}</span>
          Logout
        </a>
      </div>
    </div>
  );
};

// Header (per mobile)
const Header = ({ onToggleSidebar }) => {
  return (
    <div className="lg:hidden p-4 bg-white shadow-md flex justify-between items-center fixed top-0 left-0 right-0 z-10">
      <h1 className="text-xl font-bold text-blue-600">FixManager</h1>
      <button onClick={onToggleSidebar} className="text-gray-700">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" /></svg>
      </button>
    </div>
  );
};

// Card Statistiche Dashboard
const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    yellow: 'bg-yellow-100 text-yellow-600',
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
  };
  return (
    <div className="bg-white p-6 rounded-lg shadow-md flex items-center">
      <div className={`p-3 rounded-full ${colors[color]} mr-4`}>
        {React.cloneElement(icon, { size: 24 })}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
};

// Lista Ticket Dashboard
const DashboardTicketList = ({ title, tickets, icon, onNavigate }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <div className="flex items-center mb-4">
        <span className="text-blue-600 mr-2">{React.cloneElement(icon, { size: 20 })}</span>
        <h3 className="text-lg font-semibold text-gray-800">{title} ({tickets.length})</h3>
      </div>
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {tickets.length === 0 ? (
          <p className="text-sm text-gray-400">Nessuna riparazione in questa lista.</p>
        ) : (
          tickets.slice(0, 5).map(ticket => (
            <div 
              key={ticket.id} 
              className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer"
              onClick={() => onNavigate('Riparazioni', ticket.id)}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm text-gray-700">{ticket.deviceModel}</span>
                <span className="text-xs text-gray-500">ID: {ticket.shortId}</span>
              </div>
              <p className="text-sm text-gray-600">{ticket.customerName}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Grafico Dashboard
const FinanceChart = ({ data, loading }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Panoramica Finanziaria (Mese)</h3>
      {loading ? (
        <p>Caricamento...</p>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
              <YAxis axisLine={false} tickLine={false} fontSize={12} />
              <Tooltip cursor={{ fill: 'transparent' }} />
              <Legend wrapperStyle={{ fontSize: "14px" }} />
              <Bar dataKey="Entrate" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Uscite" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};


// --- HOOKS DATI ---

// Hook per caricare i Clienti
const useCustomers = (dbUserRef) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef) {
      setLoading(false);
      return;
    };
    
    setLoading(true);
    const customersCol = collection(dbUserRef, 'customers');
    const unsubscribe = onSnapshot(customersCol, (snapshot) => {
      const customersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(customersList);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento clienti:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef]);

  return { customers, loading };
};

// Hook per caricare i Tecnici (e Admin)
const useTechnicians = (dbUserRef, appUser) => {
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef || appUser.role !== 'Owner') {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const usersCol = collection(dbUserRef, 'managedUsers');
    const q = query(usersCol, where("role", "in", ["Technician", "Admin"]));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const techsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTechnicians(techsList);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento tecnici:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser.role]);

  return { technicians, loading };
};

// Hook per caricare i Ticket
const useTickets = (dbUserRef, appUser, managedUsers) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const ticketsCol = collection(dbUserRef, 'tickets');
    let q;

    if (appUser.role === 'Owner' || appUser.role === 'Admin' || appUser.permissions.includes('all')) {
      // Owner e Admin vedono tutto
      q = query(ticketsCol);
    } else {
      // I Tecnici vedono solo i ticket a cui sono assegnati (o quelli del loro team)
      const visibleUsers = [appUser.id, ...managedUsers.map(u => u.id)];
      q = query(ticketsCol, where("assignedTo", "in", visibleUsers));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordina per data di arrivo (più recente prima)
      ticketsList.sort((a, b) => new Date(b.arrivalDate) - new Date(a.arrivalDate));
      setTickets(ticketsList);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento ticket:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser, managedUsers]);

  return { tickets, loading };
};

// Hook per caricare i Movimenti Finanziari
const useFinance = (dbUserRef, appUser, managedUsers) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef) {
      setLoading(false);
      return;
    }
    // Solo Owner e Admin possono vedere le finanze
    if (appUser.role !== 'Owner' && appUser.role !== 'Admin' && !appUser.permissions.includes('all')) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const financeCol = collection(dbUserRef, 'finance');
    const q = query(financeCol); // Admin/Owner vedono tutto

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const movementsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Ordina per data (più recente prima)
      movementsList.sort((a, b) => new Date(b.date) - new Date(a.date));
      setMovements(movementsList);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento finanze:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser]);

  return { movements, loading };
};


// --- SEZIONE DASHBOARD (DASHBOARDVIEW) ---
const DashboardView = ({ dbUserRef, appUser, managedUsers, onNavigate, allAdmins, customers, loadingCustomers }) => {
  const { tickets, loading: ticketsLoading } = useTickets(dbUserRef, appUser, managedUsers);
  const { movements, loading: financeLoading } = useFinance(dbUserRef, appUser, managedUsers);

  if (ticketsLoading || financeLoading || loadingCustomers) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="loader text-gray-700">Caricamento dati dashboard...</div>
      </div>
    );
  }

  // Calcoli Finanziari
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  
  const monthMovements = movements.filter(m => m.date >= firstDayOfMonth);
  const monthEntrate = monthMovements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
  const monthUscite = monthMovements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
  
  const financeData = [
    { name: 'Incassi', Entrate: monthEntrate },
    { name: 'Spese', Uscite: monthUscite },
  ];

  // Calcoli Riparazioni per liste
  const ticketsInAttesa = tickets.filter(t => t.status === 'In Coda');
  const ticketsInLavorazione = tickets.filter(t => t.status === 'In Lavorazione');
  const ticketsPronti = tickets.filter(t => t.status === 'Pronto per il Ritiro');
  const totalCustomers = customers.length;
  
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Bentornato, {appUser.username}!</h2>
      
      {/* GRIGLIA STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="In Lavorazione" value={ticketsInLavorazione.length} icon={ICONS.Working} color="yellow" />
        <StatCard title="Pronte per Ritiro" value={ticketsPronti.length} icon={ICONS.Ready} color="blue" />
        <StatCard title="Clienti Totali" value={totalCustomers} icon={ICONS.Customers} color="green" />
      </div>

      {/* Layout a 2 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colonna Sinistra - Finanze */}
          <FinanceChart data={financeData} loading={financeLoading} />
          
          {/* Colonna Destra - Liste Ticket */}
          <div className="space-y-6">
               <DashboardTicketList
                title="In Coda (Ultime 5)"
                tickets={ticketsInAttesa}
                icon={ICONS.Queue}
                onNavigate={onNavigate}
               />
               <DashboardTicketList
                title="Pronte per il Ritiro"
                tickets={ticketsPronti}
                icon={ICONS.Ready}
                onNavigate={onNavigate}
               />
          </div>
      </div>
      
    </div>
  );
};


// --- SEZIONE RIPARAZIONI (REPAIRVIEW) ---

// Componente di ricerca e filtri
const RepairFilters = ({ filters, onFilterChange, onSearch, technicians, appUser }) => {
  const statusOptions = [
    { value: 'all', label: 'Tutti gli Stati' },
    { value: 'In Coda', label: 'In Coda' },
    { value: 'In Lavorazione', label: 'In Lavorazione' },
    { value: 'Pronto per il Ritiro', label: 'Pronto per Ritiro' },
    { value: 'Consegnato', label: 'Consegnato' },
    { value: 'Archiviato', label: 'Archiviato' },
  ];

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Ricerca */}
        <input
          type="text"
          placeholder="Cerca ID, cliente, modello..."
          className="p-2 border rounded-md"
          onChange={(e) => onSearch(e.target.value)}
        />
        
        {/* Filtro Stato */}
        <select
          value={filters.status}
          onChange={(e) => onFilterChange('status', e.target.value)}
          className="p-2 border rounded-md bg-white"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        
        {/* Filtro Tecnico (Solo per Admin/Owner) */}
        {(appUser.role === 'Owner' || appUser.role === 'Admin') && (
          <select
            value={filters.technician}
            onChange={(e) => onFilterChange('technician', e.target.value)}
            className="p-2 border rounded-md bg-white"
          >
            <option value="all">Tutti i Tecnici</option>
            {technicians.map(tech => (
              <option key={tech.id} value={tech.id}>{tech.username}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

// Tabella Riparazioni
const RepairTable = ({ tickets, onRowClick, getStatusClass, getCustomerName }) => {
  return (
    <div className="bg-white shadow-md rounded-lg overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dispositivo</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data Arrivo</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {tickets.map(ticket => (
            <tr key={ticket.id} onClick={() => onRowClick(ticket.id)} className="hover:bg-gray-50 cursor-pointer">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">{ticket.shortId}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{getCustomerName(ticket.customerId)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{ticket.deviceModel}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(ticket.status)}`}>
                  {ticket.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(ticket.arrivalDate).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Vista Principale Riparazioni
const RepairView = ({ dbUserRef, appUser, onNavigate, technicians, allAdmins, customers, loadingCustomers }) => {
  const { tickets, loading: ticketsLoading } = useTickets(dbUserRef, appUser, allAdmins); // Usa allAdmins per hook
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: 'all',
    technician: 'all',
  });

  // Funzione per ottenere il nome del cliente (memoizzata)
  const getCustomerName = useMemo(() => {
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    return (customerId) => customerMap.get(customerId) || 'Cliente Sconosciuto';
  }, [customers]);
  
  // Funzione per colore stato
  const getStatusClass = (status) => {
    switch (status) {
      case 'In Coda': return 'bg-yellow-100 text-yellow-800';
      case 'In Lavorazione': return 'bg-blue-100 text-blue-800';
      case 'Pronto per il Ritiro': return 'bg-green-100 text-green-800';
      case 'Consegnato': return 'bg-gray-100 text-gray-800';
      case 'Archiviato': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const searchMatch = searchTerm.length < 2 || 
        (ticket.shortId && ticket.shortId.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (getCustomerName(ticket.customerId).toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ticket.deviceModel && ticket.deviceModel.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ticket.imei && ticket.imei.toLowerCase().includes(searchTerm.toLowerCase()));
        
      const statusMatch = filters.status === 'all' || ticket.status === filters.status;
      
      const techMatch = filters.technician === 'all' || ticket.assignedTo === filters.technician;
      
      return searchMatch && statusMatch && techMatch;
    });
  }, [tickets, searchTerm, filters, getCustomerName]);

  if (ticketsLoading || loadingCustomers) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="loader text-gray-700">Caricamento riparazioni...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">Gestione Riparazioni</h2>
        <button
          onClick={() => onNavigate('Nuova Riparazione')}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
        >
          {ICONS.NewRepair}
          <span className="ml-2">Nuova Riparazione</span>
        </button>
      </div>
      
      <RepairFilters
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={setSearchTerm}
        technicians={technicians}
        appUser={appUser}
      />
      
      {filteredTickets.length > 0 ? (
        <RepairTable
          tickets={filteredTickets}
          onRowClick={(id) => onNavigate('Riparazioni', id)}
          getStatusClass={getStatusClass}
          getCustomerName={getCustomerName}
        />
      ) : (
        <div className="text-center p-10 bg-white rounded-lg shadow-md">
          <p className="text-gray-500">Nessuna riparazione trovata con questi filtri.</p>
        </div>
      )}
    </div>
  );
};


// --- VISTA DETTAGLIO RIPARAZIONE ---

// Modal Stampa
const PrintModal = ({ isOpen, onClose, ticket, customer, appUser }) => {
  const printRef = useRef();

  const handlePrint = () => {
    const content = printRef.current.innerHTML;
    const pwin = window.open('', '_blank', 'width=800,height=600');
    pwin.document.open();
    pwin.document.write(`
      <html>
        <head>
          <title>Stampa Riparazione ${ticket.shortId}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.5; font-size: 10pt; }
            .printable-content { width: 90%; margin: 0 auto; padding: 20px; }
            h2 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
            .section { margin-bottom: 20px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
            .section h3 { font-size: 12pt; margin-bottom: 10px; border-bottom: 1px solid #eee; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .grid-item { }
            .grid-item strong { display: block; font-size: 9pt; color: #555; }
            .grid-item span { font-size: 11pt; }
            .notes { border: 1px solid #ccc; padding: 10px; min-height: 50px; background: #f9f9f9; }
            .footer { text-align: center; font-size: 9pt; margin-top: 30px; }
            .signature { font-size: 6px; color: #D1D5DB; padding-top: 1rem; text-align: center; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${content}
        </body>
      </html>
    `);
    pwin.document.close();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Stampa Ingresso</h3>
          <button onClick={onClose}>{ICONS.Close}</button>
        </div>
        
        {/* Contenuto Stampabile */}
        <div ref={printRef} className="printable-content text-black">
          <h2>Riparazione #{ticket.shortId}</h2>
          
          <div className="section">
            <h3>Cliente e Dispositivo</h3>
            <div className="grid">
              <div className="grid-item"><strong>Cliente:</strong> <span>{customer?.name || 'N/D'}</span></div>
              <div className="grid-item"><strong>Telefono:</strong> <span>{customer?.phone || 'N/D'}</span></div>
              <div className="grid-item"><strong>Modello:</strong> <span>{ticket.deviceModel || 'N/D'}</span></div>
              <div className="grid-item"><strong>IMEI/Seriale:</strong> <span>{ticket.imei || 'N/D'}</span></div>
            </div>
          </div>
          
          <div className="section">
            <h3>Dettagli Riparazione</h3>
            <div className="grid">
              <div className="grid-item"><strong>Data Arrivo:</strong> <span>{new Date(ticket.arrivalDate).toLocaleString()}</span></div>
              <div className="grid-item"><strong>Acconto:</strong> <span>€{ticket.deposit || 0}</span></div>
              <div className="grid-item"><strong>Preventivo:</strong> <span>€{ticket.price || 0}</span></div>
              <div className="grid-item"><strong>Tecnico:</strong> <span>{ticket.assignedTo || 'Non assegnato'}</span></div>
            </div>
          </div>
          
          <div className="section">
            <h3>Problema Segnalato</h3>
            <p className="notes">{ticket.problem || 'Nessun problema segnalato.'}</p>
          </div>
          
          <div className="section">
            <h3>Note Interne</h3>
            <p className="notes">{ticket.internalNotes || 'Nessuna nota interna.'}</p>
          </div>
          
          <div className="footer">
            <p>Grazie per averci scelto. Conservare questo buono per il ritiro.</p>
            <p style={{fontWeight: 'bold', marginTop: '8px'}}>FixManager</p>
          </div>
          <div className="signature">
            {appUser?.username || 'FixManager'}
          </div>
        </div>
        {/* Fine contenuto stampabile */}
        
        <button
          onClick={handlePrint}
          className="mt-6 w-full flex justify-center items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          {ICONS.Print}
          <span className="ml-2">Stampa</span>
        </button>
      </div>
    </div>
  );
};

// Modal Scontrino/POS
const PosModal = ({ isOpen, onClose, ticket, customer, appUser }) => {
  const printRef = useRef();

  const handlePrintPos = () => {
    const content = printRef.current.innerHTML;
    const pwin = window.open('', '_blank', 'width=300,height=500'); // Dimensione tipica scontrino
    pwin.document.open();
    pwin.document.write(`
      <html>
        <head>
          <title>Scontrino ${ticket.shortId}</title>
          <style>
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 10pt; 
              line-height: 1.4;
              width: 280px; /* Larghezza scontrino 80mm */
              margin: 0;
              padding: 10px;
            }
            .printable-content { width: 100%; }
            h2 { font-size: 12pt; text-align: center; margin: 0; }
            .header { text-align: center; font-size: 9pt; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px; }
            .section { margin-bottom: 10px; }
            .item-list { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; }
            .item { display: flex; justify-content: space-between; }
            .item .name { width: 70%; }
            .item .price { width: 30%; text-align: right; }
            .totals { margin-top: 10px; }
            .total-row { display: flex; justify-content: space-between; font-weight: bold; }
            .footer { text-align: center; font-size: 9pt; margin-top: 20px; border-top: 1px dashed #000; padding-top: 10px; }
            .signature { font-size: 6px; color: #333; padding-top: 1rem; text-align: center; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${content}
        </body>
      </html>
    `);
    pwin.document.close();
  };

  if (!isOpen) return null;
  
  const price = ticket.price || 0;
  const deposit = ticket.deposit || 0;
  const toPay = price - deposit;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Stampa Scontrino (POS)</h3>
          <button onClick={onClose}>{ICONS.Close}</button>
        </div>
        
        {/* Contenuto Stampabile (Stile Scontrino) */}
        <div ref={printRef} className="printable-content p-4 text-black bg-gray-50 border">
          <h2 className="text-xl font-bold text-center mb-4">FixManager</h2>
          <div className="header text-center text-xs mb-4">
            <p>FixManager di {appUser?.username || 'Admin'}</p>
            <p>Via Roma 1, 12345 Città</p>
            <p>P.IVA 1234567890</p>
          </div>
          
          <div className="section text-xs">
            <p>Scontrino per Riparazione: #{ticket.shortId}</p>
            <p>Cliente: {customer?.name || 'N/D'}</p>
            <p>Data: {new Date().toLocaleString()}</p>
          </div>

          <div className="item-list text-xs my-4">
            <div className="item">
              <span className="name">Riparazione: {ticket.deviceModel}</span>
              <span className="price">€{price.toFixed(2)}</span>
            </div>
            {/* Qui si potrebbero aggiungere parti di ricambio se tracciate */}
          </div>
          
          <div className="totals text-sm">
            <div className="total-row">
              <span>Totale:</span>
              <span>€{price.toFixed(2)}</span>
            </div>
            <div className="total-row">
              <span>Acconto Versato:</span>
              <span>-€{deposit.toFixed(2)}</span>
            </div>
            <hr className="my-1 border-dashed border-black" />
            <div className="total-row text-base">
              <span>DA PAGARE:</span>
              <span>€{toPay.toFixed(2)}</span>
            </div>
          </div>
          
          <div className="footer text-center text-xs mt-8">
            <p>Grazie per aver scelto {appUser?.username || 'FixManager'}!</p>
            <p className="font-bold mt-2">FixManager</p>
          </div>
          <div className="signature" style={{ fontSize: '6px', color: '#D1D5DB', paddingTop: '1rem', textAlign: 'center' }}>
            {appUser?.username || 'FixManager'}
          </div>
        </div>
        {/* Fine contenuto stampabile */}
        
        <button
          onClick={handlePrintPos}
          className="mt-6 w-full flex justify-center items-center bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          {ICONS.Print}
          <span className="ml-2">Stampa Scontrino</span>
        </button>
      </div>
    </div>
  );
};


// Modal Condivisione
const ShareModal = ({ isOpen, onClose, ticket, customer }) => {
  const [message, setMessage] = useState('');
  const [notifType, setNotifType] = useState('ready'); // 'ready' o 'quote'
  
  const readyMessage = `FixManager: Gentile ${customer?.name || 'Cliente'}, la sua riparazione (ID: ${ticket.shortId}, ${ticket.deviceModel}) è pronta per il ritiro. Costo totale: €${ticket.price || 0}. Saluti.`;
  const quoteMessage = `FixManager: Gentile ${customer?.name || 'Cliente'}, il preventivo per la sua riparazione (ID: ${ticket.shortId}, ${ticket.deviceModel}) è di €${ticket.price || 0}. Attendiamo conferma. Saluti.`;
  
  useEffect(() => {
    if (isOpen) {
      setMessage(notifType === 'ready' ? readyMessage : quoteMessage);
    }
  }, [isOpen, notifType, customer, ticket]);

  const copyToClipboard = () => {
    // Usa document.execCommand per compatibilità iframe
    const ta = document.createElement('textarea');
    ta.value = message;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Errore nel copiare:', err);
    }
    document.body.removeChild(ta);
  };
  
  const getWhatsAppLink = () => {
    const phone = customer?.phone?.replace(/\s+/g, ''); // Rimuovi spazi
    if (!phone) return '#';
    return `https_//wa.me/${phone}?text=${encodeURIComponent(message)}`;
    // Sostituito https con https_ per evitare problemi di link
  };
  
  const getSmsLink = () => {
    const phone = customer?.phone?.replace(/\s+/g, '');
    if (!phone) return '#';
    return `sms:${phone}?body=${encodeURIComponent(message)}`;
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Notifica Cliente</h3>
          <button onClick={onClose}>{ICONS.Close}</button>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo Notifica:</label>
          <select 
            value={notifType} 
            onChange={(e) => setNotifType(e.target.value)}
            className="w-full p-2 border rounded-md bg-white"
          >
            <option value="ready">Pronto per il Ritiro</option>
            <option value="quote">Preventivo Pronto</option>
          </select>
        </div>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Messaggio:</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows="5"
            className="w-full p-2 border rounded-md bg-gray-50"
          ></textarea>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={copyToClipboard}
            className="flex-1 flex items-center justify-center bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg"
          >
            {ICONS.Copy} <span className="ml-2">Copia</span>
          </button>
          <a
            href={getWhatsAppLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg"
            // onClick in caso di link https_
            onClick={(e) => { 
              e.target.href = e.target.href.replace('https_', 'https://');
            }}
          >
            {ICONS.Send} <span className="ml-2">WhatsApp</span>
          </a>
          <a
            href={getSmsLink()}
            className="flex-1 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg"
          >
            {ICONS.Send} <span className="ml-2">SMS</span>
          </a>
        </div>
        
      </div>
    </div>
  );
};


// Vista Dettaglio Riparazione
const RepairDetailView = ({ ticketId, onNavigate, dbUserRef, appUser, customers, technicians, showNotify, settings }) => {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [editData, setEditData] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  
  // Stati dei Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  
  const ticketRef = useMemo(() => doc(dbUserRef, 'tickets', ticketId), [dbUserRef, ticketId]);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onSnapshot(ticketRef, (docSnap) => {
      if (docSnap.exists()) {
        const ticketData = { id: docSnap.id, ...docSnap.data() };
        setTicket(ticketData);
        setEditData(ticketData); // Inizializza form di modifica
        
        // Carica il cliente associato
        const cust = customers.find(c => c.id === ticketData.customerId);
        setCustomer(cust || null);
        
      } else {
        console.error("Ticket non trovato!");
        setTicket(null);
      }
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento ticket:", error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [ticketRef, customers]);
  
  const handleEditChange = (e) => {
    const { name, value, type } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  const handleSave = async () => {
    try {
      await updateDoc(ticketRef, editData);
      setIsEditing(false);
      showNotify("Riparazione aggiornata!", "success");
    } catch (e) {
      console.error("Errore salvataggio:", e);
      showNotify("Errore durante il salvataggio.", "error");
    }
  };
  
  // Funzioni per bottoni rapidi
  const updateStatus = async (newStatus) => {
    try {
      const updates = { status: newStatus };
      // Se lo stato è "Consegnato", imposta anche il saldo a 0 (prezzo - acconto)
      if (newStatus === 'Consegnato') {
        const toPay = (ticket.price || 0) - (ticket.deposit || 0);
        updates.balance = 0; // Saldo
        
        // Aggiungi movimento finanziario (se non già pagato)
        if (toPay > 0) {
          const financeCol = collection(dbUserRef, 'finance');
          await addDoc(financeCol, {
            date: new Date().toISOString().split('T')[0],
            description: `Saldo Riparazione ID: ${ticket.shortId}`,
            amount: toPay,
            type: 'Entrata',
            ticketId: ticket.id,
          });
        }
      }
      await updateDoc(ticketRef, updates);
      showNotify(`Stato aggiornato a: ${newStatus}`, "success");
    } catch (e) {
      console.error("Errore aggiornamento stato:", e);
      showNotify("Errore aggiornamento stato.", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="loader text-gray-700">Caricamento ticket...</div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6">
        <button onClick={() => onNavigate('Riparazioni')} className="flex items-center text-blue-600 hover:underline mb-4">
          {ICONS.Back} <span className="ml-2">Torna a Riparazioni</span>
        </button>
        <h2 className="text-2xl font-semibold text-red-600">Errore</h2>
        <p className="text-gray-500">Ticket non trovato.</p>
      </div>
    );
  }
  
  const statusOptions = ['In Coda', 'In Lavorazione', 'Pronto per il Ritiro', 'Consegnato', 'Archiviato'];
  const dataToEdit = isEditing ? editData : ticket;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <button onClick={() => onNavigate('Riparazioni')} className="flex items-center text-blue-600 hover:underline mb-2">
            {ICONS.Back} <span className="ml-2">Torna a Riparazioni</span>
          </button>
          <h2 className="text-2xl font-semibold text-gray-900">Riparazione ID: {ticket.shortId}</h2>
          <p className="text-gray-500">{ticket.deviceModel}</p>
        </div>
        <div className="flex flex-col items-end space-y-2">
          {/* Bottoni Azioni Rapide */}
          <div className="flex space-x-2">
            <button onClick={() => setIsPrintModalOpen(true)} className="flex items-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-3 rounded-lg text-sm">
              {ICONS.Print} <span className="ml-1 hidden sm:inline">Stampa</span>
            </button>
            <button onClick={() => setIsShareModalOpen(true)} className="flex items-center bg-blue-100 hover:bg-blue-200 text-blue-700 font-medium py-2 px-3 rounded-lg text-sm">
              {ICONS.Share} <span className="ml-1 hidden sm:inline">Notifica</span>
            </button>
            <button onClick={() => setIsPosModalOpen(true)} className="flex items-center bg-green-100 hover:bg-green-200 text-green-700 font-medium py-2 px-3 rounded-lg text-sm">
              {ICONS.POS} <span className="ml-1 hidden sm:inline">POS</span>
            </button>
            
            {isEditing ? (
              <button onClick={handleSave} className="flex items-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 rounded-lg text-sm">
                Salva
              </button>
            ) : (
              <button onClick={() => setIsEditing(true)} className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm">
                {ICONS.Edit} <span className="ml-1 hidden sm:inline">Modifica</span>
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Contenuto a griglia */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Colonna Sinistra (Dettagli) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Box Cliente */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">{ICONS.Customer} <span className="ml-2">Dati Cliente</span></h3>
            {customer ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <p><strong>Nome:</strong> {customer.name}</p>
                <p><strong>Telefono:</strong> {customer.phone}</p>
                <p><strong>Email:</strong> {customer.email || 'N/D'}</p>
                <p><strong>Indirizzo:</strong> {customer.address || 'N/D'}</p>
              </div>
            ) : (
              <p className="text-gray-500">Cliente non trovato.</p>
            )}
          </div>
          
          {/* Box Dispositivo e Problema */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">{ICONS.Device} <span className="ml-2">Dispositivo e Problema</span></h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block text-xs text-gray-500">Modello</label>
                {isEditing ? (
                  <input type="text" name="deviceModel" value={editData.deviceModel || ''} onChange={handleEditChange} className="w-full p-2 border rounded" />
                ) : (
                  <p>{ticket.deviceModel}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500">IMEI/Seriale</label>
                {isEditing ? (
                  <input type="text" name="imei" value={editData.imei || ''} onChange={handleEditChange} className="w-full p-2 border rounded" />
                ) : (
                  <p>{ticket.imei || 'N/D'}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500">Password/PIN</label>
                {isEditing ? (
                  <input type="text" name="devicePin" value={editData.devicePin || ''} onChange={handleEditChange} className="w-full p-2 border rounded" />
                ) : (
                  <p>{ticket.devicePin || 'N/D'}</p>
                )}
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs text-gray-500">Problema Segnalato</label>
              {isEditing ? (
                <textarea name="problem" value={editData.problem || ''} onChange={handleEditChange} className="w-full p-2 border rounded" rows="3"></textarea>
              ) : (
                <p className="p-2 bg-gray-50 rounded min-h-[50px]">{ticket.problem || 'Nessuno'}</p>
              )}
            </div>
          </div>
          
          {/* Box Note Interne */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">{ICONS.Notes} <span className="ml-2">Note Interne (Solo Staff)</span></h3>
            {isEditing ? (
              <textarea name="internalNotes" value={editData.internalNotes || ''} onChange={handleEditChange} className="w-full p-2 border rounded" rows="5"></textarea>
            ) : (
              <p className="p-2 bg-yellow-50 text-yellow-800 rounded min-h-[100px]">{ticket.internalNotes || 'Nessuna nota interna.'}</p>
            )}
          </div>
        </div>
        
        {/* Colonna Destra (Stato e Finanze) */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Box Stato */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">{ICONS.Info} <span className="ml-2">Stato Riparazione</span></h3>
            
            <label className="block text-xs text-gray-500">Stato Attuale</label>
            {isEditing ? (
              <select name="status" value={editData.status} onChange={handleEditChange} className="w-full p-2 border rounded bg-white">
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <p className="text-lg font-bold">{ticket.status}</p>
            )}
            
            <div className="mt-4">
              <label className="block text-xs text-gray-500">Tecnico Assegnato</label>
              {isEditing ? (
                <select name="assignedTo" value={editData.assignedTo} onChange={handleEditChange} className="w-full p-2 border rounded bg-white">
                  <option value="">Non assegnato</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.username}</option>)}
                </select>
              ) : (
                <p>{technicians.find(t => t.id === ticket.assignedTo)?.username || 'Non assegnato'}</p>
              )}
            </div>
            
            <div className="mt-4">
              <label className="block text-xs text-gray-500">Data Arrivo</label>
              <p>{new Date(ticket.arrivalDate).toLocaleString()}</p>
            </div>
            
            {/* Bottoni Cambio Stato Rapido */}
            {!isEditing && (
              <div className="mt-6 space-y-2">
                {ticket.status === 'In Coda' && (
                  <button onClick={() => updateStatus('In Lavorazione')} className="w-full text-center p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600">
                    Prendi in Carico
                  </button>
                )}
                {ticket.status === 'In Lavorazione' && (
                  <button onClick={() => updateStatus('Pronto per il Ritiro')} className="w-full text-center p-2 rounded-lg bg-green-500 text-white hover:bg-green-600">
                    Completa Riparazione
                  </button>
                )}
                {ticket.status === 'Pronto per il Ritiro' && (
                  <button onClick={() => updateStatus('Consegnato')} className="w-full text-center p-2 rounded-lg bg-gray-700 text-white hover:bg-gray-800">
                    Consegna al Cliente
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Box Finanze */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center">{ICONS.Deposit} <span className="ml-2">Finanze</span></h3>
            
            <div className="mb-4">
              <label className="block text-xs text-gray-500">Preventivo (€)</label>
              {isEditing ? (
                <input type="number" name="price" value={editData.price || 0} onChange={handleEditChange} className="w-full p-2 border rounded" />
              ) : (
                <p className="text-2xl font-bold">€{ticket.price || 0}</p>
              )}
            </div>
            
            <div className="mb-4">
              <label className="block text-xs text-gray-500">Acconto Versato (€)</label>
              {isEditing ? (
                <input type="number" name="deposit" value={editData.deposit || 0} onChange={handleEditChange} className="w-full p-2 border rounded" />
              ) : (
                <p className="text-lg">€{ticket.deposit || 0}</p>
              )}
            </div>
            
            <hr className="my-4" />
            
            <div className="text-right">
              <p className="text-sm text-gray-500">Saldo da Pagare</p>
              <p className="text-3xl font-bold text-green-600">
                €{( (isEditing ? editData.price : ticket.price) || 0) - ( (isEditing ? editData.deposit : ticket.deposit) || 0)}
              </p>
            </div>
          </div>

        </div>
      </div>
      
      {/* Modali */}
      <PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        ticket={ticket}
        customer={customer}
        appUser={appUser}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        ticket={ticket}
        customer={customer}
      />
      <PosModal
        isOpen={isPosModalOpen}
        onClose={() => setIsPosModalOpen(false)}
        ticket={ticket}
        customer={customer}
        appUser={appUser}
      />
    </div>
  );
};


// --- SEZIONE CLIENTI ---
const CustomerView = ({ dbUserRef, onNavigate, customers, loadingCustomers }) => {
  const [view, setView] = useState('list'); // 'list' o 'new' o 'edit'
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleSaveCustomer = async (customerData) => {
    try {
      if (view === 'new') {
        const customersCol = collection(dbUserRef, 'customers');
        await addDoc(customersCol, customerData);
      } else if (view === 'edit' && currentCustomer) {
        const customerRef = doc(dbUserRef, 'customers', currentCustomer.id);
        await updateDoc(customerRef, customerData);
      }
      setView('list');
      setCurrentCustomer(null);
    } catch (e) {
      console.error("Errore salvataggio cliente:", e);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (view === 'new' || (view === 'edit' && currentCustomer)) {
    return (
      <CustomerForm
        customer={currentCustomer}
        onSave={handleSaveCustomer}
        onCancel={() => { setView('list'); setCurrentCustomer(null); }}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">Clienti</h2>
        <button
          onClick={() => setView('new')}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          {ICONS.NewCustomer}
          <span className="ml-2">Nuovo Cliente</span>
        </button>
      </div>
      
      <input
        type="text"
        placeholder="Cerca per nome o telefono..."
        className="w-full p-2 border rounded-md mb-4"
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telefono</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loadingCustomers ? (
              <tr><td colSpan="4" className="text-center p-4">Caricamento...</td></tr>
            ) : (
              filteredCustomers.map(customer => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{customer.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{customer.phone}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{customer.email || 'N/D'}</td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => {
                        setCurrentCustomer(customer);
                        setView('edit');
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Modifica
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Form Cliente
const CustomerForm = ({ customer, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
  });

  useEffect(() => {
    if (customer) {
      setFormData(customer);
    } else {
      setFormData({ name: '', phone: '', email: '', address: '' });
    }
  }, [customer]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.name && formData.phone) {
      onSave(formData);
    } else {
      alert("Nome e Telefono sono obbligatori.");
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">
        {customer ? 'Modifica Cliente' : 'Nuovo Cliente'}
      </h2>
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-gray-700">Nome Completo *</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full p-2 border rounded" required />
          </div>
          <div>
            <label className="block text-gray-700">Telefono *</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full p-2 border rounded" required />
          </div>
          <div>
            <label className="block text-gray-700">Email</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-2 border rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700">Indirizzo</label>
            <input type="text" name="address" value={formData.address} onChange={handleChange} className="w-full p-2 border rounded" />
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <button type="button" onClick={onCancel} className="py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            Annulla
          </button>
          <button type="submit" className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Salva Cliente
          </button>
        </div>
      </form>
    </div>
  );
};


// --- SEZIONE FINANZE ---
const FinanceView = ({ dbUserRef, appUser, managedUsers }) => {
  const { movements, loading } = useFinance(dbUserRef, appUser, managedUsers);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], description: '', amount: 0, type: 'Uscita' });
  
  const handleSaveMovement = async () => {
    if (!formData.description || !formData.amount) {
      alert("Descrizione e Importo sono obbligatori.");
      return;
    }
    try {
      const financeCol = collection(dbUserRef, 'finance');
      await addDoc(financeCol, {
        ...formData,
        amount: Number(formData.amount),
        createdBy: appUser.id
      });
      setIsModalOpen(false);
      setFormData({ date: new Date().toISOString().split('T')[0], description: '', amount: 0, type: 'Uscita' });
    } catch (e) {
      console.error("Errore salvataggio movimento:", e);
    }
  };

  const totalEntrate = movements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
  const totalUscite = movements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
  const balance = totalEntrate - totalUscite;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">Finanze</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          {ICONS.NewMovement}
          <span className="ml-2">Nuovo Movimento</span>
        </button>
      </div>
      
      {/* Riepilogo Finanziario */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-green-100 rounded-lg shadow">
          <p className="text-sm text-green-700">Entrate Totali</p>
          <p className="text-2xl font-bold text-green-800">€{totalEntrate.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-red-100 rounded-lg shadow">
          <p className="text-sm text-red-700">Uscite Totali</p>
          <p className="text-2xl font-bold text-red-800">€{totalUscite.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-blue-100 rounded-lg shadow">
          <p className="text-sm text-blue-700">Saldo Attuale</p>
          <p className="text-2xl font-bold text-blue-800">€{balance.toFixed(2)}</p>
        </div>
      </div>
      
      {/* Tabella Movimenti */}
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrizione</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Importo</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="3" className="text-center p-4">Caricamento...</td></tr>
            ) : (
              movements.map(mov => (
                <tr key={mov.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-700">{new Date(mov.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{mov.description}</td>
                  <td className={`px-6 py-4 text-sm font-bold ${mov.type === 'Entrata' ? 'text-green-600' : 'text-red-600'}`}>
                    {mov.type === 'Entrata' ? '+' : '-'}€{mov.amount.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modal Nuovo Movimento */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Nuovo Movimento</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm">Data</label>
                <input type="date" value={formData.date} onChange={(e) => setFormData(f => ({...f, date: e.target.value}))} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm">Descrizione</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData(f => ({...f, description: e.target.value}))} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm">Importo (€)</label>
                <input type="number" value={formData.amount} onChange={(e) => setFormData(f => ({...f, amount: e.target.value}))} className="w-full p-2 border rounded" />
              </div>
              <div>
                <label className="block text-sm">Tipo</label>
                <select value={formData.type} onChange={(e) => setFormData(f => ({...f, type: e.target.value}))} className="w-full p-2 border rounded bg-white">
                  <option value="Uscita">Uscita</option>
                  <option value="Entrata">Entrata</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-4 mt-6">
              <button onClick={() => setIsModalOpen(false)} className="py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                Annulla
              </button>
              <button onClick={handleSaveMovement} className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// --- SEZIONE IMPOSTAZIONI (ADMIN) ---
const SettingsView = ({ dbUserRef, appUser }) => {
  // Hook per caricare TUTTI gli utenti (Admin e Tecnici)
  const [managedUsers, setManagedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list', 'new', 'edit'
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (appUser.role !== 'Owner') return; // Solo Owner
    
    const usersCol = collection(dbUserRef, 'managedUsers');
    const unsubscribe = onSnapshot(usersCol, (snapshot) => {
      setManagedUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento utenti:", error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [dbUserRef, appUser.role]);
  
  const handleSaveUser = async (userData) => {
    try {
      if (view === 'new') {
        // ID univoco per il nuovo utente (es. username in minuscolo)
        const newId = userData.username.toLowerCase().replace(/\s/g, '');
        if (!newId) {
          alert("Username non valido.");
          return;
        }
        // Controlla se esiste già
        const userRef = doc(dbUserRef, 'managedUsers', newId);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          alert("Questo username esiste già.");
          return;
        }
        await setDoc(userRef, { ...userData, id: newId });
        
      } else if (view === 'edit' && currentUser) {
        // Non permettiamo di cambiare l'ID (username) per ora
        const userRef = doc(dbUserRef, 'managedUsers', currentUser.id);
        await updateDoc(userRef, userData);
      }
      setView('list');
      setCurrentUser(null);
    } catch (e) {
      console.error("Errore salvataggio utente:", e);
    }
  };
  
  const handleDeleteUser = async (userId) => {
    if (userId === 'owner') {
      alert("Impossibile eliminare l'utente Owner.");
      return;
    }
    if (window.confirm("Sei sicuro di voler eliminare questo utente?")) {
      try {
        const userRef = doc(dbUserRef, 'managedUsers', userId);
        await deleteDoc(userRef);
      } catch (e) {
        console.error("Errore eliminazione utente:", e);
      }
    }
  };

  if (appUser.role !== 'Owner') {
    return <div className="p-6 text-red-500">Accesso negato. Solo l'Owner può accedere alle impostazioni.</div>;
  }
  
  if (view === 'new' || (view === 'edit' && currentUser)) {
    return (
      <UserForm
        user={currentUser}
        onSave={handleSaveUser}
        onCancel={() => { setView('list'); setCurrentUser(null); }}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold text-gray-900">Impostazioni Utenti</h2>
        <button
          onClick={() => { setView('new'); setCurrentUser(null); }}
          className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg"
        >
          {ICONS.NewCustomer}
          <span className="ml-2">Nuovo Utente</span>
        </button>
      </div>
      
      <div className="bg-white shadow-md rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ruolo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="3" className="text-center p-4">Caricamento...</td></tr>
            ) : (
              managedUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.username}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{user.role}</td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <button
                      onClick={() => {
                        setCurrentUser(user);
                        setView('edit');
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Modifica
                    </button>
                    {user.id !== 'owner' && (
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Elimina
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Form Utente
const UserForm = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'Technician',
    permissions: [],
  });
  
  const isNew = !user;

  useEffect(() => {
    if (user) {
      setFormData(user);
    } else {
      setFormData({ username: '', password: '', role: 'Technician', permissions: [] });
    }
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.username && formData.password) {
      // Semplice gestione permessi (da migliorare)
      let permissions = [];
      if (formData.role === 'Owner') permissions = ['all'];
      if (formData.role === 'Admin') permissions = ['all']; // Admin = Owner (quasi)
      if (formData.role === 'Technician') permissions = ['view_repairs', 'edit_repairs'];
      
      onSave({ ...formData, permissions });
    } else {
      alert("Username e Password sono obbligatori.");
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">
        {user ? 'Modifica Utente' : 'Nuovo Utente'}
      </h2>
      <form onSubmit={handleSubmit} className="max-w-lg mx-auto bg-white p-8 rounded-lg shadow-md">
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700">Username *</label>
            <input 
              type="text" 
              name="username" 
              value={formData.username} 
              onChange={handleChange} 
              className="w-full p-2 border rounded" 
              required 
              disabled={!isNew} // Non si può cambiare username
            />
            {!isNew && <p className="text-xs text-gray-400">L'username non può essere modificato.</p>}
          </div>
          <div>
            <label className="block text-gray-700">Password *</label>
            <input 
              type="password" 
              name="password" 
              value={formData.password} 
              onChange={handleChange} 
              className="w-full p-2 border rounded" 
              required 
              placeholder={isNew ? "" : "Lascia vuoto per non cambiare"}
            />
          </div>
          <div>
            <label className="block text-gray-700">Ruolo</label>
            <select 
              name="role" 
              value={formData.role} 
              onChange={handleChange} 
              className="w-full p-2 border rounded bg-white"
              disabled={formData.id === 'owner'} // Non si può cambiare ruolo a Owner
            >
              <option value="Technician">Tecnico</option>
              <option value="Admin">Admin</option>
              <option value="Owner">Owner</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-4 mt-6">
          <button type="button" onClick={onCancel} className="py-2 px-4 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
            Annulla
          </button>
          <button type="submit" className="py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Salva Utente
          </button>
        </div>
      </form>
    </div>
  );
};


// --- SEZIONE NUOVA RIPARAZIONE ---
const NewRepairForm = ({ dbUserRef, appUser, onNavigate, customers, loadingCustomers, technicians, showNotify }) => {
  const [step, setStep] = useState(1); // 1: Cliente, 2: Dispositivo, 3: Riepilogo
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [deviceData, setDeviceData] = useState({
    deviceModel: '',
    imei: '',
    devicePin: '',
    problem: '',
    internalNotes: '',
    price: 0,
    deposit: 0,
    assignedTo: '',
    status: 'In Coda',
    arrivalDate: new Date().toISOString(),
  });
  
  const handleDeviceChange = (e) => {
    const { name, value, type } = e.target;
    setDeviceData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };
  
  const handleNewCustomerChange = (e) => {
    const { name, value } = e.target;
    setNewCustomer(prev => ({ ...prev, [name]: value }));
  };

  const handleCreateTicket = async () => {
    let customerId = selectedCustomerId;
    
    try {
      // 1. Se è un nuovo cliente, crealo prima
      if (!customerId) {
        if (!newCustomer.name || !newCustomer.phone) {
          showNotify("Nome e Telefono del nuovo cliente sono obbligatori.", "error");
          return;
        }
        const customersCol = collection(dbUserRef, 'customers');
        const docRef = await addDoc(customersCol, newCustomer);
        customerId = docRef.id;
      }
      
      // 2. Genera un ID corto
      const counterRef = doc(dbUserRef, 'state', 'ticketCounter');
      let nextId = 1001;
      const counterSnap = await getDoc(counterRef);
      
      if (counterSnap.exists()) {
        nextId = counterSnap.data().count + 1;
      }
      await setDoc(counterRef, { count: nextId });
      const shortId = `R${nextId}`;

      // 3. Crea il ticket
      const ticketsCol = collection(dbUserRef, 'tickets');
      const finalTicketData = {
        ...deviceData,
        customerId: customerId,
        customerName: selectedCustomerId ? customers.find(c => c.id === customerId)?.name : newCustomer.name, // Denormalizzato per ricerca
        shortId: shortId,
        createdBy: appUser.id,
        // Assicura che i valori numerici siano numeri
        price: Number(deviceData.price) || 0,
        deposit: Number(deviceData.deposit) || 0,
      };
      
      const ticketDocRef = await addDoc(ticketsCol, finalTicketData);
      
      // 4. (Opzionale) Se c'è un acconto, crea movimento finanziario
      if (finalTicketData.deposit > 0) {
        const financeCol = collection(dbUserRef, 'finance');
        await addDoc(financeCol, {
          date: new Date().toISOString().split('T')[0],
          description: `Acconto Riparazione ID: ${shortId}`,
          amount: finalTicketData.deposit,
          type: 'Entrata',
          ticketId: ticketDocRef.id,
        });
      }

      showNotify(`Riparazione ${shortId} creata con successo!`, "success");
      onNavigate('Riparazioni', ticketDocRef.id); // Vai al dettaglio
      
    } catch (e) {
      console.error("Errore creazione ticket:", e);
      showNotify("Errore durante la creazione del ticket.", "error");
    }
  };
  
  const getCustomer = () => {
    if (selectedCustomerId) return customers.find(c => c.id === selectedCustomerId);
    if (!selectedCustomerId && newCustomer.name) return newCustomer;
    return null;
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Crea Nuova Riparazione</h2>
      
      {/* Stepper */}
      <div className="mb-8">
        <ol className="flex items-center w-full text-sm font-medium text-center text-gray-500">
          <li className={`flex md:w-full items-center ${step >= 1 ? 'text-blue-600' : ''} after:content-[''] after:w-full after:h-1 after:border-b ${step > 1 ? 'after:border-blue-600' : 'after:border-gray-200'} after:border-1 after:hidden sm:after:inline-block after:mx-6 xl:after:mx-10`}>
            <span className="flex items-center after:content-['/'] sm:after:hidden after:mx-2 after:text-gray-200">
              {step > 1 ? <CheckSquare className="w-4 h-4 mr-2" /> : <span className="mr-2">1</span>}
              Cliente
            </span>
          </li>
          <li className={`flex md:w-full items-center ${step >= 2 ? 'text-blue-600' : ''} after:content-[''] after:w-full after:h-1 after:border-b ${step > 2 ? 'after:border-blue-600' : 'after:border-gray-200'} after:border-1 after:hidden sm:after:inline-block after:mx-6 xl:after:mx-10`}>
            <span className="flex items-center after:content-['/'] sm:after:hidden after:mx-2 after:text-gray-200">
              {step > 2 ? <CheckSquare className="w-4 h-4 mr-2" /> : <span className="mr-2">2</span>}
              Dispositivo
            </span>
          </li>
          <li className={`flex items-center ${step >= 3 ? 'text-blue-600' : ''}`}>
            <span className="mr-2">3</span>
            Riepilogo
          </li>
        </ol>
      </div>
      
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-lg shadow-md">
        
        {/* Step 1: Cliente */}
        {step === 1 && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Step 1: Seleziona o Crea Cliente</h3>
            
            <label className="block text-gray-700 mb-2">Cerca Cliente Esistente</label>
            <select
              value={selectedCustomerId || ''}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setNewCustomer({ name: '', phone: '', email: '', address: '' }); // Resetta form nuovo
              }}
              className="w-full p-2 border rounded bg-white mb-4"
              disabled={loadingCustomers}
            >
              <option value="">{loadingCustomers ? 'Caricamento...' : '-- Seleziona un cliente --'}</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
              ))}
            </select>
            
            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-gray-500">OPPURE</span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>
            
            <h4 className="font-semibold mb-2">Crea Nuovo Cliente</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" name="name" placeholder="Nome Completo *" value={newCustomer.name} onChange={handleNewCustomerChange} className="w-full p-2 border rounded" disabled={!!selectedCustomerId} />
              <input type="tel" name="phone" placeholder="Telefono *" value={newCustomer.phone} onChange={handleNewCustomerChange} className="w-full p-2 border rounded" disabled={!!selectedCustomerId} />
              <input type="email" name="email" placeholder="Email" value={newCustomer.email} onChange={handleNewCustomerChange} className="w-full p-2 border rounded" disabled={!!selectedCustomerId} />
              <input type="text" name="address" placeholder="Indirizzo" value={newCustomer.address} onChange={handleNewCustomerChange} className="w-full p-2 border rounded" disabled={!!selectedCustomerId} />
            </div>
            
            <div className="flex justify-end mt-6">
              <button 
                onClick={() => setStep(2)} 
                disabled={!selectedCustomerId && !newCustomer.name}
                className="py-2 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                Avanti
              </button>
            </div>
          </div>
        )}
        
        {/* Step 2: Dispositivo */}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Step 2: Dettagli Dispositivo e Riparazione</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" name="deviceModel" placeholder="Modello Dispositivo *" value={deviceData.deviceModel} onChange={handleDeviceChange} className="w-full p-2 border rounded md:col-span-2" required />
              <input type="text" name="imei" placeholder="IMEI / Seriale" value={deviceData.imei} onChange={handleDeviceChange} className="w-full p-2 border rounded" />
              <input type="text" name="devicePin" placeholder="PIN / Password Sblocco" value={deviceData.devicePin} onChange={handleDeviceChange} className="w-full p-2 border rounded" />
            </div>
            
            <textarea name="problem" placeholder="Problema Segnalato *" value={deviceData.problem} onChange={handleDeviceChange} className="w-full p-2 border rounded mt-4" rows="3" required></textarea>
            <textarea name="internalNotes" placeholder="Note Interne (opzionale)" value={deviceData.internalNotes} onChange={handleDeviceChange} className="w-full p-2 border rounded mt-4" rows="3"></textarea>
            
            <hr className="my-6" />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input type="number" name="price" placeholder="Preventivo (€)" value={deviceData.price} onChange={handleDeviceChange} className="w-full p-2 border rounded" />
              <input type="number" name="deposit" placeholder="Acconto (€)" value={deviceData.deposit} onChange={handleDeviceChange} className="w-full p-2 border rounded" />
              <select name="assignedTo" value={deviceData.assignedTo} onChange={handleDeviceChange} className="w-full p-2 border rounded bg-white">
                <option value="">Assegna a...</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.username}</option>)}
              </select>
            </div>

            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="py-2 px-6 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                Indietro
              </button>
              <button 
                onClick={() => setStep(3)} 
                disabled={!deviceData.deviceModel || !deviceData.problem}
                className="py-2 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                Riepilogo
              </button>
            </div>
          </div>
        )}
        
        {/* Step 3: Riepilogo */}
        {step === 3 && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Step 3: Riepilogo e Conferma</h3>
            <div className="space-y-4 text-sm">
              <div className="p-4 bg-gray-50 rounded-md">
                <h4 className="font-bold">Cliente:</h4>
                <p>{getCustomer()?.name} ({getCustomer()?.phone})</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-md">
                <h4 className="font-bold">Dispositivo:</h4>
                <p>{deviceData.deviceModel} (IMEI: {deviceData.imei || 'N/D'})</p>
                <p><strong>Problema:</strong> {deviceData.problem}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-md">
                <h4 className="font-bold">Dettagli:</h4>
                <p><strong>Preventivo:</strong> €{deviceData.price || 0}</p>
                <p><strong>Acconto:</strong> €{deviceData.deposit || 0}</p>
                <p><strong>Tecnico:</strong> {technicians.find(t => t.id === deviceData.assignedTo)?.username || 'Non assegnato'}</p>
              </div>
            </div>
            
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(2)} className="py-2 px-6 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                Indietro
              </button>
              <button 
                onClick={handleCreateTicket} 
                className="py-2 px-6 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Crea Riparazione
              </button>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};



// --- COMPONENTE PRINCIPALE APP ---

// Notifiche (Toast)
const Notification = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000); // Chiude dopo 3 secondi
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-500' : 'bg-red-500';

  return (
    <div className={`fixed top-5 right-5 ${bgColor} text-white py-2 px-4 rounded-lg shadow-lg z-50`}>
      {message}
    </div>
  );
};

// Funzione helper per ottenere tutti gli admin/owner (per visibilità ticket)
const useAllAdmins = (dbUserRef) => {
  const [admins, setAdmins] = useState([]);
  useEffect(() => {
    if (!dbUserRef) return;
    const usersCol = collection(dbUserRef, 'managedUsers');
    const q = query(usersCol, where("role", "in", ["Owner", "Admin"]));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAdmins(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [dbUserRef]);
  return admins;
};

// --- STRUTTURA DI AVVIO CORRETTA ---

// 1. Creiamo un componente "figlio" che consumerà il contesto
function AppContent() {
  // Ora useContext(AuthContext) funzionerà, perché è DENTRO il Provider
  const { authReady, appUser, loading, error, login, logout, dbUserRef } = useContext(AuthContext);

  const [currentView, setCurrentView] = useState('Dashboard');
  const [detailId, setDetailId] = useState(null); // Per dettaglio riparazione
  const [notification, setNotification] = useState(null); // {message, type}
  
  // Hooks Dati
  const { customers, loadingCustomers } = useCustomers(dbUserRef);
  const allAdmins = useAllAdmins(dbUserRef); // Carica tutti gli admin/owner
  const { technicians, loading: loadingTechnicians } = useTechnicians(dbUserRef, appUser || {}); // {} per evitare errori al logout

  const showNotify = (message, type = 'success') => {
    setNotification({ message, type });
  };
  
  const handleNavigate = (view, id = null) => {
    setCurrentView(view);
    setDetailId(id);
  };

  if (!authReady || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="loader text-gray-700">Caricamento...</div>
      </div>
    );
  }

  if (!appUser) {
    return <LoginScreen onLogin={login} error={error} loading={loading} />;
  }
  
  // Se loggato, renderizza l'app principale
  const renderView = () => {
    if (detailId && currentView === 'Riparazioni') {
      return <RepairDetailView 
                ticketId={detailId} 
                onNavigate={handleNavigate} 
                dbUserRef={dbUserRef}
                appUser={appUser}
                customers={customers}
                technicians={technicians}
                showNotify={showNotify}
                settings={{}} // Aggiungi impostazioni se necessario
              />;
    }
    
    switch (currentView) {
      case 'Dashboard':
        return <DashboardView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={allAdmins} // managedUsers ora sono gli admin per la logica ticket
                  onNavigate={handleNavigate} 
                  allAdmins={allAdmins}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                />;
      case 'Riparazioni':
        return <RepairView 
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  onNavigate={handleNavigate}
                  technicians={technicians}
                  allAdmins={allAdmins}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                />;
      case 'Clienti':
        return <CustomerView 
                  dbUserRef={dbUserRef}
                  onNavigate={handleNavigate}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                />;
      case 'Finanze':
        return <FinanceView 
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  managedUsers={allAdmins}
                />;
      case 'Impostazioni':
        return <SettingsView 
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                />;
      case 'Nuova Riparazione':
        return <NewRepairForm 
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  onNavigate={handleNavigate}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                  technicians={technicians}
                  showNotify={showNotify}
                />;
      default:
        return <DashboardView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={allAdmins} 
                  onNavigate={handleNavigate} 
                  allAdmins={allAdmins}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      
      {/* Sidebar (solo desktop) */}
      <div className="hidden lg:block">
        <Sidebar
          currentView={currentView}
          onNavigate={handleNavigate}
          onLogout={logout}
          appUser={appUser}
        />
      </div>

      {/* Header (solo mobile) - DA IMPLEMENTARE */}
      {/* <Header onToggleSidebar={() => {}} /> */}
      
      {/* Contenuto Principale */}
      <main className="flex-1 lg:ml-64 overflow-y-auto">
        {/* Padding per header mobile (se ci fosse) */}
        {/* <div className="lg:hidden pt-16"></div> */}
        
        {renderView()}
      </main>
    </div>
  );
}


// 2. L'export di default è il "Provider" che carica i dati
export default function App() {
  // Chiamiamo il nostro hook che prepara tutti i dati di autenticazione
  const authData = useAuth();

  // Forniamo i dati (authData) a tutti i componenti figli
  return (
    <AuthContext.Provider value={authData}>
      <AppContent /> 
    </AuthContext.Provider>
  );
}
