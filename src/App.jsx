import React, { useState, useEffect, useRef, createContext, useContext, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously,
  signInWithCustomToken // Mantenuto per completezza
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
  arrayContains,
  serverTimestamp, // Aggiunto per date
  writeBatch // Aggiunto per operazioni multiple
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
// *** MODIFICATO: Inserita la tua chiave Firebase direttamente ***
const firebaseConfig = {
  apiKey: "AIzaSyA6CPWS6ynAU78JnUVKFSU7k1IyONN3jPk",
  authDomain: "fixmanager-f6821.firebaseapp.com",
  projectId: "fixmanager-f6821",
  storageBucket: "fixmanager-f6821.firebasestorage.app",
  messagingSenderId: "165228137867",
  appId: "1:165228137867:web:0e381e99c97c3c4604338e",
  measurementId: "G-EBE2Z8FPYC"
};
// --- FINE MODIFICA ---

const appId = firebaseConfig.projectId || 'default-app-id';

let db;
let auth;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // setLogLevel('debug'); // Decommenta per debug firestore
} catch (e) {
  console.error("Errore inizializzazione Firebase:", e);
}

// --- CONTESTO AUTENTICAZIONE ---
const AuthContext = createContext(null);

// Hook per l'autenticazione
const useAuth = () => {
  const [currentUser, setCurrentUser] = useState(null); // Utente Firebase
  const [appUser, setAppUser] = useState(null); // Utente loggato (owner, tecnico)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authReady, setAuthReady] = useState(false); // Per "schermata bianca"
  const [dbUserRef, setDbUserRef] = useState(null); // Riferimento al doc utente

  useEffect(() => {
    // *** MODIFICATO: Forzato accesso anonimo ***
    // L'errore 'auth/custom-token-mismatch' avveniva perché
    // __initial_auth_token appartiene all'ambiente, ma
    // firebaseConfig appartiene al tuo progetto. Non corrispondono.
    // Dobbiamo forzare l'accesso anonimo al TUO progetto.
    const performAuth = async () => {
      try {
        await signInAnonymously(auth); // Forza l'accesso anonimo
      } catch (e) {
        console.error("Errore di autenticazione:", e);
        setError("Errore di autenticazione.");
      }
    };
    // --- FINE MODIFICA ---

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
      setAuthReady(true); // Segnala che l'autenticazione è completa
      setLoading(false);
    });

    performAuth(); // Esegui l'accesso
    return () => unsubscribe(); // Pulisci al unmount
  }, []);

  // Funzione per inizializzare gli utenti di default (OWNER + TECNICO)
  const initializeDefaultUsers = async (userId) => {
    const usersCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/users`);
    try {
      const snapshot = await getDocs(query(usersCollectionRef, limit(1)));
      if (snapshot.empty) {
        // Nessun utente, creiamo i default
        const batch = writeBatch(db);
        
        // Utente Owner
        const ownerUser = {
          username: 'owner',
          password: '123', // NB: Salvare password in chiaro non è sicuro
          role: 'Owner',
          pin: '1234'
        };
        batch.set(doc(usersCollectionRef, 'owner'), ownerUser);

        // Utente Tecnico
        const techUser = {
          username: 'tecnico',
          password: '123',
          role: 'Tecnico',
          pin: '0000'
        };
        batch.set(doc(usersCollectionRef, 'tecnico'), techUser);

        await batch.commit();
        console.log("Utenti di default 'owner' e 'tecnico' creati.");
      }
    } catch (e) {
      console.error("Errore inizializzazione utenti di default:", e);
    }
  };

  // Funzione di Login
  const login = async (username, password) => {
    setLoading(true);
    setError('');
    
    if (!dbUserRef) {
      setError("Errore: Riferimento database non pronto.");
      setLoading(false);
      return;
    }
    
    const usersCollectionRef = collection(dbUserRef, 'users');
    const q = query(usersCollectionRef, where("username", "==", username));

    try {
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError('Utente non trovato.');
      } else {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        
        if (userData.password === password) {
          setAppUser(userData);
          // Salva lo stato di login nel db
          await setDoc(doc(dbUserRef, 'state', 'appLogin'), {
            loggedIn: true,
            user: userData,
            lastLogin: serverTimestamp()
          });
        } else {
          setError('Password errata.');
        }
      }
    } catch (e) {
      console.error("Errore durante il login:", e);
      setError('Errore durante il login.');
    }
    setLoading(false);
  };

  // Funzione di Logout
  const logout = async () => {
    if (dbUserRef) {
      try {
        await setDoc(doc(dbUserRef, 'state', 'appLogin'), {
          loggedIn: false,
          user: null,
          lastLogout: serverTimestamp()
        });
      } catch (e) {
        console.error("Errore durante il salvataggio del logout:", e);
      }
    }
    setAppUser(null);
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
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-2xl shadow-xl">
        <div className="text-center">
          <Wrench className="mx-auto h-12 w-auto text-blue-400" />
          <h2 className="mt-6 text-3xl font-extrabold text-white">
            FixManager
          </h2>
          <p className="mt-2 text-sm text-gray-400">Accedi al tuo gestionale</p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-700 bg-gray-900 placeholder-gray-500 text-white rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Username (es: owner)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-700 bg-gray-900 placeholder-gray-500 text-white rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password (es: 123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center text-red-400 bg-red-900/30 p-3 rounded-md">
              <AlertCircle size={20} className="mr-2" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-gray-900 disabled:bg-blue-800 disabled:opacity-70"
            >
              {loading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                'Accedi'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// --- COMPONENTI UI GENERICI ---

// Icone (centralizzate)
const ICONS = {
  Dashboard: <LayoutDashboard size={20} />,
  Riparazioni: <Wrench size={20} />,
  Clienti: <Users size={20} />,
  Finanze: <DollarSign size={20} />,
  Nuovo: <Plus size={20} />,
  Impostazioni: <Settings size={20} />,
  Queue: <History size={16} />,
  Working: <Wrench size={16} />,
  Ready: <CheckSquare size={16} />,
  Customers: <Contact size={16} />,
  Details: <FileText size={16} />,
};

// Sidebar
const Sidebar = ({ currentView, onNavigate, onLogout, appUser }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isAdmin = appUser?.role === 'Owner';

  const NavItem = ({ view, label, icon }) => (
    <button
      onClick={() => {
        onNavigate(view);
        setIsMobileOpen(false);
      }}
      className={`flex items-center w-full px-4 py-3 rounded-lg transition-colors duration-200 ${
        currentView === view
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {icon}
      <span className="ml-4 font-medium">{label}</span>
    </button>
  );

  const navContent = (
    <div className="flex flex-col justify-between h-full p-4">
      <div>
        <div className="flex items-center mb-8 px-4">
          <Wrench className="h-8 w-auto text-blue-400" />
          <span className="ml-3 text-2xl font-bold text-white">FixManager</span>
        </div>
        <nav className="space-y-2">
          <NavItem view="Dashboard" label="Dashboard" icon={ICONS.Dashboard} />
          <NavItem view="Riparazioni" label="Riparazioni" icon={ICONS.Riparazioni} />
          <NavItem view="Clienti" label="Clienti" icon={ICONS.Clienti} />
          <NavItem view="Finanze" label="Finanze" icon={ICONS.Finanze} />
          {isAdmin && (
            <NavItem view="Impostazioni" label="Impostazioni" icon={ICONS.Impostazioni} />
          )}
        </nav>
      </div>
      
      <div className="space-y-4">
        <button
          onClick={() => onNavigate('NewRepair')}
          className="flex items-center justify-center w-full px-4 py-3 rounded-lg transition-colors duration-200 bg-blue-600 text-white hover:bg-blue-700"
        >
          {ICONS.Nuovo}
          <span className="ml-3 font-medium">Nuova Riparazione</span>
        </button>
        <div className="border-t border-gray-700 pt-4">
          <div className="flex items-center px-2">
            <div className="flex-shrink-0">
              <span className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-gray-700">
                <span className="text-sm font-medium leading-none text-white">{appUser?.username.charAt(0).toUpperCase()}</span>
              </span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-white">{appUser?.username}</p>
              <p className="text-xs font-medium text-gray-400">{appUser?.role}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center w-full px-4 py-3 mt-4 rounded-lg transition-colors duration-200 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <LogOut size={20} />
            <span className="ml-4 font-medium">Esci</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar Desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 bg-gray-900">
          {navContent}
        </div>
      </div>
      
      {/* Mobile Menu Button */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 p-2 rounded-md bg-gray-800 text-gray-300"
      >
        <LayoutDashboard size={24} />
      </button>

      {/* Mobile Sidebar (Overlay) */}
      {isMobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setIsMobileOpen(false)}></div>
          <div className="md:hidden fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 overflow-y-auto">
            {navContent}
          </div>
        </>
      )}
    </>
  );
};

// Card Statistiche Dashboard
const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    yellow: "bg-yellow-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
  };
  return (
    <div className="bg-gray-800 rounded-lg shadow p-5 flex items-center space-x-4">
      <div className={`p-3 rounded-full ${colors[color] || 'bg-gray-500'} text-white`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-400">{title}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
};

// Lista Ticket Dashboard
const DashboardTicketList = ({ title, tickets, icon, onNavigate }) => {
  return (
    <div className="bg-gray-800 rounded-lg shadow p-5">
      <div className="flex items-center mb-4">
        {icon}
        <h3 className="ml-2 text-lg font-semibold text-white">{title} ({tickets.length})</h3>
      </div>
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {tickets.length > 0 ? (
          tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => onNavigate('RepairDetail', { ticketId: ticket.id })}
              className="flex justify-between items-center w-full text-left p-3 bg-gray-700 rounded-md hover:bg-gray-600"
            >
              <div>
                <p className="text-sm font-medium text-white">{ticket.deviceName}</p>
                <p className="text-xs text-gray-400">{ticket.customerName} - {ticket.problemDescription.substring(0, 30)}...</p>
              </div>
              <ChevronRight size={16} className="text-gray-500" />
            </button>
          ))
        ) : (
          <p className="text-sm text-gray-500">Nessuna riparazione in questa lista.</p>
        )}
      </div>
    </div>
  );
};

// Grafico Dashboard
const FinanceChart = ({ data, loading }) => {
  if (loading) {
    return <div className="text-center text-gray-500">Caricamento grafico...</div>;
  }
  if (data.length === 0) {
    return <div className="text-center text-gray-500">Nessun dato finanziario per questo mese.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data}>
        <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
        <YAxis stroke="#9CA3AF" fontSize={12} />
        <Tooltip
          cursor={{ fill: 'rgba(107, 114, 128, 0.3)' }}
          contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
        />
        <Legend />
        <Bar dataKey="Entrate" fill="#3B82F6" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Uscite" fill="#EF4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};


// --- HOOKS DATI ---

// Hook per caricare i Clienti
const useCustomers = (dbUserRef) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef) return;
    setLoading(true);
    const customersRef = collection(dbUserRef, 'customers');
    const q = query(customersRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(customersData);
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
    if (!dbUserRef || appUser?.role !== 'Owner') {
      setTechnicians([]);
      setLoading(false);
      return;
    }
    
    const usersRef = collection(dbUserRef, 'users');
    const q = query(usersRef, where('role', 'in', ['Tecnico', 'Owner']));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const techsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTechnicians(techsData);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento tecnici:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser]);

  return { technicians, loading };
};

// Hook per caricare i Ticket
const useTickets = (dbUserRef, appUser, managedUsers) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef || !appUser) return;

    const ticketsRef = collection(dbUserRef, 'tickets');
    let q;

    if (appUser.role === 'Owner') {
      // Owner vede i ticket di tutti gli utenti gestiti
      const usersToQuery = [...managedUsers.map(u => u.username), appUser.username];
      q = query(ticketsRef, where('technician', 'in', usersToQuery));
    } else {
      // Tecnico vede solo i suoi
      q = query(ticketsRef, where('technician', '==', appUser.username));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Converte timestamp firestore in Date JS per ordinamento
        createdAt: doc.data().createdAt?.toDate()
      }));
      // Ordina per data, più recente prima
      ticketsData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTickets(ticketsData);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento tickets:", error);
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
    if (!dbUserRef || !appUser) return;
    
    const financeRef = collection(dbUserRef, 'finance');
    let q;

    if (appUser.role === 'Owner') {
      const usersToQuery = [...managedUsers.map(u => u.username), appUser.username];
      q = query(financeRef, where('createdBy', 'in', usersToQuery));
    } else {
      q = query(financeRef, where('createdBy', '==', appUser.username));
    }
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() // Converti timestamp
      }));
      data.sort((a, b) => (b.date || 0) - (a.date || 0)); // Ordina
      setMovements(data);
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento finanze:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser, managedUsers]);

  return { movements, loading };
};


// --- SEZIONE DASHBOARD (DASHBOARDVIEW) ---
const DashboardView = ({ dbUserRef, appUser, managedUsers, onNavigate, allAdmins, customers, loadingCustomers }) => {
  const { tickets, loading: ticketsLoading } = useTickets(dbUserRef, appUser, managedUsers);
  const { movements, loading: financeLoading } = useFinance(dbUserRef, appUser, managedUsers);

  if (ticketsLoading || financeLoading || loadingCustomers) {
    return (
      <div className="flex justify-center items-center h-full">
        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  // Calcoli Finanziari
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthMovements = movements.filter(m => m.date >= startOfMonth);
  const monthEntrate = monthMovements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
  const monthUscite = monthMovements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
  
  // Calcoli Riparazioni per liste
  const ticketsInAttesa = tickets.filter(t => t.status === 'In Coda');
  const ticketsInLavorazione = tickets.filter(t => t.status === 'In Lavorazione');
  const ticketsPronti = tickets.filter(t => t.status === 'Pronto per il Ritiro');
  const totalCustomers = customers.length;
  
  // Dati Grafico
  const financeData = [
    { name: 'Mese Corrente', Entrate: monthEntrate, Uscite: monthUscite },
  ];

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-white mb-6">Bentornato, {appUser.username}!</h2>
      
      {/* Griglia Statistiche */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="In Lavorazione" value={ticketsInLavorazione.length} icon={ICONS.Working} color="yellow" />
        <StatCard title="Pronte per Ritiro" value={ticketsPronti.length} icon={ICONS.Ready} color="blue" />
        <StatCard title="Clienti Totali" value={totalCustomers} icon={ICONS.Customers} color="green" />
      </div>

      {/* Layout a 2 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Colonna Sinistra */}
        <div className="space-y-6">
          {/* Grafico Finanziario */}
          <div className="bg-gray-800 rounded-lg shadow p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Finanze (Mese Corrente)</h3>
            <FinanceChart data={financeData} loading={financeLoading} />
          </div>
        </div>

        {/* Colonna Destra */}
          <div className="space-y-6">
               {/* Lista "In Coda" */}
               <DashboardTicketList
                title="In Coda"
                tickets={ticketsInAttesa}
                icon={ICONS.Queue}
                onNavigate={onNavigate}
               />
               {/* Lista "Pronte" */}
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
  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <input
        type="text"
        placeholder="Cerca per nome, dispositivo, ID..."
        className="flex-grow bg-gray-700 text-white placeholder-gray-400 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        onChange={(e) => onSearch(e.target.value)}
      />
      <select
        name="status"
        value={filters.status}
        onChange={onFilterChange}
        className="bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Tutti gli stati</option>
        <option value="In Coda">In Coda</option>
        <option value="In Lavorazione">In Lavorazione</option>
        <option value="Preventivo">Preventivo</option>
        <option value="Pronto per il Ritiro">Pronto per il Ritiro</option>
        <option value="Completato">Completato</option>
        <option value="Non Riparabile">Non Riparabile</option>
      </select>
      
      {appUser.role === 'Owner' && (
        <select
          name="technician"
          value={filters.technician}
          onChange={onFilterChange}
          className="bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tutti i tecnici</option>
          {technicians.map(tech => (
            <option key={tech.id} value={tech.username}>{tech.username}</option>
          ))}
        </select>
      )}
    </div>
  );
};

// Tabella Riparazioni
const RepairTable = ({ tickets, onRowClick, getStatusClass, getCustomerName }) => {
  return (
    <div className="bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Cliente</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Dispositivo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Tecnico</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Stato</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Prezzo</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {tickets.map(ticket => (
              <tr key={ticket.id} onClick={() => onRowClick(ticket.id)} className="hover:bg-gray-700 cursor-pointer">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{ticket.ticketId}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getCustomerName(ticket.customerId)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{ticket.deviceName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{ticket.technician}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(ticket.status)}`}>
                    {ticket.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">€{ticket.price.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tickets.length === 0 && (
         <p className="text-center text-gray-500 py-10">Nessuna riparazione trovata.</p>
      )}
    </div>
  );
};

// Vista Principale Riparazioni
const RepairView = ({ dbUserRef, appUser, onNavigate, technicians, allAdmins, customers, loadingCustomers }) => {
  const { tickets, loading } = useTickets(dbUserRef, appUser, allAdmins);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ status: '', technician: '' });

  const handleFilterChange = (e) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'Sconosciuto';
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const customerName = getCustomerName(ticket.customerId).toLowerCase();
      const search = searchTerm.toLowerCase();
      
      const matchesSearch = 
        customerName.includes(search) ||
        ticket.deviceName.toLowerCase().includes(search) ||
        ticket.ticketId.toLowerCase().includes(search) ||
        ticket.problemDescription.toLowerCase().includes(search);
        
      const matchesStatus = filters.status ? ticket.status === filters.status : true;
      const matchesTechnician = filters.technician ? ticket.technician === filters.technician : true;
      
      return matchesSearch && matchesStatus && matchesTechnician;
    });
  }, [tickets, searchTerm, filters, customers]);

  const getStatusClass = (status) => {
    switch (status) {
      case 'In Coda': return 'bg-gray-600 text-gray-100';
      case 'In Lavorazione': return 'bg-yellow-600 text-yellow-100';
      case 'Preventivo': return 'bg-purple-600 text-purple-100';
      case 'Pronto per il Ritiro': return 'bg-blue-600 text-blue-100';
      case 'Completato': return 'bg-green-600 text-green-100';
      case 'Non Riparabile': return 'bg-red-600 text-red-100';
      default: return 'bg-gray-600 text-gray-100';
    }
  };

  if (loading || loadingCustomers) {
     return (
      <div className="flex justify-center items-center h-full">
        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-white mb-6">Tutte le Riparazioni</h2>
      <RepairFilters 
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={setSearchTerm}
        technicians={technicians}
        appUser={appUser}
      />
      <RepairTable
        tickets={filteredTickets}
        onRowClick={(ticketId) => onNavigate('RepairDetail', { ticketId })}
        getStatusClass={getStatusClass}
        getCustomerName={getCustomerName}
      />
    </div>
  );
};


// --- VISTA DETTAGLIO RIPARAZIONE ---

// Modal Stampa
const PrintModal = ({ isOpen, onClose, ticket, customer, appUser }) => {
  const printRef = useRef();

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Ricarica per ripristinare lo stato
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6 relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white">
          <X size={24} />
        </button>
        <h3 className="text-xl font-semibold text-white mb-4">Stampa Scheda</h3>
        
        {/* Contenuto Stampabile */}
        <div ref={printRef} className="printable-content p-4 text-black bg-white rounded">
          <style type="text/css" media="print">
            {`
              @page { size: auto; margin: 20mm; }
              body { background-color: #fff; }
              .printable-content { color: #000; }
              .signature { font-size: 6px !important; color: #D1D5DB !important; padding-top: 1rem !important; text-align: center !important; }
            `}
          </style>
          <h2 className="text-xl font-bold text-center mb-4">FixManager - Scheda Riparazione</h2>
          <div className="text-center text-xs mb-4">
            <p className="font-bold">ID Ticket: {ticket.ticketId}</p>
            <p>Data: {new Date(ticket.createdAt).toLocaleDateString()}</p>
          </div>
          <div className="border-t border-b border-gray-300 py-4 my-4">
            <h3 className="font-bold mb-2">Cliente:</h3>
            <p>{customer?.name || 'Non specificato'}</p>
            <p>{customer?.phone || 'Nessun telefono'}</p>
            <p>{customer?.email || 'Nessuna email'}</p>
          </div>
          <div className="border-b border-gray-300 pb-4 mb-4">
            <h3 className="font-bold mb-2">Dispositivo:</h3>
            <p>{ticket.deviceName}</p>
            <p>SN/IMEI: {ticket.imei || 'N/D'}</p>
            <p>Password: {ticket.password || 'N/D'}</p>
          </div>
          <div className="border-b border-gray-300 pb-4 mb-4">
            <h3 className="font-bold mb-2">Problema Segnalato:</h3>
            <p>{ticket.problemDescription}</p>
          </div>
          <div>
            <h3 className="font-bold mb-2">Note Tecnico:</h3>
            <div className="h-20 border border-gray-300 rounded p-1">
              {ticket.notes || ''}
            </div>
          </div>
          <div className="text-right font-bold text-lg mt-4">
            <p>Prezzo: €{ticket.price.toFixed(2)}</p>
          </div>
          <div className="mt-8 text-center text-xs">
            <p>Grazie per averci scelto. Conservare questo buono per il ritiro.</p>
            <p className="font-bold mt-2">FixManager</p>
          </div>
          {/* FIRMA DEVELOPER */}
          <div className="signature" style={{ fontSize: '6px', color: '#D1D5DB', paddingTop: '1rem', textAlign: 'center' }}>
            {appUser?.username || 'FixManager'}
          </div>
        </div>
        {/* Fine contenuto stampabile */}
        
        <button
          onClick={handlePrint}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center"
        >
          <Printer size={20} className="mr-2" />
          Stampa
        </button>
      </div>
    </div>
  );
};

// Modal Scontrino/POS
const PosModal = ({ isOpen, onClose, ticket, customer, appUser }) => {
  const printRef = useRef();

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;
    
    // Stile per simulare scontrino
    const printStyles = `
      <style>
        @page { 
          size: 80mm auto; /* Larghezza scontrino 80mm */
          margin: 0;
        }
        body { 
          margin: 0; 
          padding: 10px;
          background-color: #fff; 
          font-family: 'Courier New', Courier, monospace;
          line-height: 1.4;
        }
        .printable-content { 
          width: 100%;
          color: #000; 
          font-size: 10px;
        }
        .signature { 
          font-size: 6px !important; 
          color: #888 !important; 
          padding-top: 1rem !important; 
          text-align: center !important; 
        }
        h2, h3, p { margin: 0; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .mb-2 { margin-bottom: 0.5rem; }
        .mb-4 { margin-bottom: 1rem; }
        .mt-4 { margin-top: 1rem; }
        .mt-8 { margin-top: 2rem; }
        .text-xl { font-size: 1.25rem; }
        .text-xs { font-size: 0.75rem; }
        .text-lg { font-size: 1.125rem; }
        .border-t { border-top: 1px dashed #000; }
        .border-b { border-bottom: 1px dashed #000; }
        .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
      </style>
    `;
    
    document.body.innerHTML = printStyles + printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Ricarica per ripristinare lo stato
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-xs p-6 relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white">
          <X size={24} />
        </button>
        <h3 className="text-xl font-semibold text-white mb-4">Stampa Scontrino</h3>
        
        {/* Contenuto Stampabile (simulazione scontrino) */}
        <div ref={printRef} className="printable-content p-4 text-black bg-white rounded">
          <h2 className="text-xl font-bold text-center mb-2">FixManager</h2>
          <div className="text-center text-xs mb-4">
            <p>FixManager di {appUser?.username || 'Admin'}</p>
            <p>Via Roma 1, 12345 Città</p>
            <p>P.IVA 1234567890</p>
            <p>{new Date().toLocaleString()}</p>
          </div>
          
          <div className="border-t border-b py-2 mb-2">
            <p>Riparazione: {ticket.deviceName}</p>
            <p>ID Ticket: {ticket.ticketId}</p>
            <p>Cliente: {customer?.name || 'N/D'}</p>
          </div>
          
          <div className="mb-4">
            <p className="flex justify-between">
              <span>Totale Riparazione</span>
              <span className="font-bold">€{ticket.price.toFixed(2)}</span>
            </p>
            <p className="flex justify-between">
              <span>IVA (22%)</span>
              <span className="font-bold">€{(ticket.price - (ticket.price / 1.22)).toFixed(2)}</span>
            </p>
          </div>
          
          <div className="border-t pt-2 text-right font-bold text-lg">
            <p>TOTALE: €{ticket.price.toFixed(2)}</p>
          </div>
          
          <div className="mt-8 text-center text-xs">
            <p>Grazie per aver scelto {appUser?.username || 'FixManager'}!</p>
            <p className="font-bold mt-2">FixManager</p>
          </div>
           {/* FIRMA DEVELOPER */}
          <div className="signature" style={{ fontSize: '6px', color: '#D1D5DB', paddingTop: '1rem', textAlign: 'center' }}>
            {appUser?.username || 'FixManager'}
          </div>
        </div>
        {/* Fine contenuto stampabile */}
        
        <button
          onClick={handlePrint}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center"
        >
          <Receipt size={20} className="mr-2" />
          Stampa Scontrino
        </button>
      </div>
    </div>
  );
};

// Modal Condivisione
const ShareModal = ({ isOpen, onClose, ticket, customer }) => {
  const [copySuccess, setCopySuccess] = useState('');
  const [phone, setPhone] = useState(customer?.phone || '');
  
  const ticketUrl = `${window.location.origin}/ticket-status/${ticket.id}`;
  const whatsappMessage = encodeURIComponent(`Ciao ${customer?.name}, la tua riparazione (ID: ${ticket.ticketId}) è ${ticket.status}. Controlla i dettagli: ${ticketUrl}`);
  const whatsappUrl = `https://wa.me/${phone}?text=${whatsappMessage}`;
  
  const smsMessage = encodeURIComponent(`FixManager: Ciao ${customer?.name}, la tua riparazione (ID: ${ticket.ticketId}) è ${ticket.status}. Dettagli: ${ticketUrl}`);
  const smsUrl = `sms:${phone}?body=${smsMessage}`;

  const copyToClipboard = () => {
    // Usa un trucco per 'document.execCommand'
    const textArea = document.createElement("textarea");
    textArea.value = ticketUrl;
    textArea.style.position = "fixed"; // Evita lo scroll
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopySuccess('Link copiato!');
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) {
      setCopySuccess('Errore nel copiare.');
    }
    document.body.removeChild(textArea);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white">
          <X size={24} />
        </button>
        <h3 className="text-xl font-semibold text-white mb-6">Condividi Stato Riparazione</h3>
        
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-400">Link Pubblico</label>
          <div className="flex">
            <input
              type="text"
              readOnly
              value={ticketUrl}
              className="flex-1 bg-gray-900 text-gray-300 px-3 py-2 rounded-l-md border border-gray-700 focus:outline-none"
            />
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700"
            >
              <ClipboardCopy size={20} />
            </button>
          </div>
          {copySuccess && <p className="text-xs text-green-400">{copySuccess}</p>}

          <div className="pt-4 border-t border-gray-700">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-400 mb-2">Numero di Telefono (per WA/SMS)</label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Es: 393331234567"
              className="w-full bg-gray-900 text-gray-300 px-3 py-2 rounded-md border border-gray-700 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <a
              href={phone ? whatsappUrl : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center p-3 rounded-lg ${phone ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
            >
              <Send size={20} className="mr-2" /> WhatsApp
            </a>
            <a
              href={phone ? smsUrl : '#'}
              className={`flex items-center justify-center p-3 rounded-lg ${phone ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
            >
              <Mail size={20} className="mr-2" /> SMS
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};


// Vista Dettaglio Riparazione
const RepairDetailView = ({ ticketId, onNavigate, dbUserRef, appUser, customers, technicians, showNotify, settings }) => {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isPosModalOpen, setIsPosModalOpen] = useState(false);
  
  const customer = useMemo(() => {
    if (!ticket || !customers) return null;
    return customers.find(c => c.id === ticket.customerId);
  }, [ticket, customers]);

  // Carica il ticket singolo
  useEffect(() => {
    if (!dbUserRef) return;
    setLoading(true);
    const ticketRef = doc(db, `artifacts/${appId}/users/${auth.currentUser.uid}/tickets`, ticketId);
    
    const unsubscribe = onSnapshot(ticketRef, (doc) => {
      if (doc.exists()) {
        setTicket({ id: doc.id, ...doc.data() });
      } else {
        console.error("Ticket non trovato");
        showNotify("Ticket non trovato", "error");
        onNavigate('Riparazioni');
      }
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento ticket:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, ticketId, onNavigate, showNotify, appId]);
  
  // Funzione per aggiornare il ticket
  const updateTicketField = async (field, value) => {
    if (!dbUserRef) return;
    const ticketRef = doc(db, `artifacts/${appId}/users/${auth.currentUser.uid}/tickets`, ticketId);
    try {
      await updateDoc(ticketRef, { [field]: value });
      showNotify("Ticket aggiornato!", "success");
    } catch (e) {
      console.error("Errore aggiornamento ticket:", e);
      showNotify("Errore aggiornamento", "error");
    }
  };

  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    updateTicketField('status', newStatus);
    
    // Se completato, aggiungi movimento finanziario
    if (newStatus === 'Completato' && ticket.price > 0) {
      const financeRef = collection(dbUserRef, 'finance');
      addDoc(financeRef, {
        description: `Riparazione ${ticket.ticketId} - ${ticket.deviceName}`,
        amount: ticket.price,
        type: 'Entrata',
        date: serverTimestamp(),
        createdBy: appUser.username,
        ticketId: ticket.id,
      });
      showNotify("Movimento finanziario aggiunto!", "info");
    }
  };
  
  const handlePriceChange = (e) => {
    const newPrice = parseFloat(e.target.value) || 0;
    updateTicketField('price', newPrice);
  };
  
  const handleNotesChange = (e) => {
    updateTicketField('notes', e.target.value);
  };

  if (loading || !ticket) {
    return (
      <div className="flex justify-center items-center h-full">
        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  const statusOptions = ['In Coda', 'In Lavorazione', 'Preventivo', 'In Attesa Ricambi', 'Pronto per il Ritiro', 'Completato', 'Non Riparabile'];

  return (
    <div className="p-6">
      <button onClick={() => onNavigate('Riparazioni')} className="flex items-center text-sm text-blue-400 hover:text-blue-300 mb-4">
        <ArrowLeft size={16} className="mr-1" />
        Torna alle Riparazioni
      </button>
      
      {/* Header Dettaglio */}
      <div className="flex flex-wrap justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">{ticket.deviceName}</h2>
          <p className="text-gray-400">ID Ticket: {ticket.ticketId}</p>
        </div>
        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
          <button onClick={() => setIsPrintModalOpen(true)} className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"><Printer size={20} /></button>
          <button onClick={() => setIsShareModalOpen(true)} className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"><Share2 size={20} /></button>
          <button onClick={() => setIsPosModalOpen(true)} className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"><Receipt size={20} /></button>
        </div>
      </div>
      
      {/* Layout Griglia */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Colonna Principale (Centrale su LG) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Info Principali */}
          <div className="bg-gray-800 rounded-lg shadow p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Dettagli Riparazione</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-400">Stato</label>
                <select
                  value={ticket.status}
                  onChange={handleStatusChange}
                  className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Prezzo Totale</label>
                <input
                  type="number"
                  step="0.01"
                  defaultValue={ticket.price.toFixed(2)}
                  onBlur={handlePriceChange} // Aggiorna quando si lascia il campo
                  className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">Dispositivo</label>
                <p className="text-white">{ticket.deviceName}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400">Tecnico Assegnato</label>
                <p className="text-white">{ticket.technician}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400">IMEI/SN</label>
                <p className="text-white">{ticket.imei || 'N/D'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400">Password Dispositivo</label>
                <p className="text-white">{ticket.password || 'N/D'}</p>
              </div>
            </div>
            
            <div className="mt-4">
              <label className="text-xs text-gray-400">Problema Segnalato</label>
              <p className="text-white p-3 bg-gray-900 rounded-md mt-1">{ticket.problemDescription}</p>
            </div>
            
             <div className="mt-4">
              <label className="text-xs text-gray-400">Note Interne (visibili solo al tecnico)</label>
              <textarea
                defaultValue={ticket.notes}
                onBlur={handleNotesChange}
                rows={4}
                className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Aggiungi note sulla riparazione..."
              />
            </div>
          </div>
          
        </div>
        
        {/* Colonna Laterale (Destra su LG) */}
        <div className="space-y-6">
          {/* Dettagli Cliente */}
          <div className="bg-gray-800 rounded-lg shadow p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Cliente</h3>
              <button onClick={() => onNavigate('CustomerEdit', { customerId: customer?.id })} className="text-blue-400 hover:text-blue-300 text-sm">
                <Edit size={16} />
              </button>
            </div>
            {customer ? (
              <div className="space-y-2">
                <p className="text-white font-medium">{customer.name}</p>
                <p className="text-gray-400 text-sm">{customer.phone}</p>
                <p className="text-gray-400 text-sm">{customer.email}</p>
                <p className="text-gray-400 text-sm pt-2 border-t border-gray-700 mt-2">{customer.address}</p>
              </div>
            ) : (
              <p className="text-gray-500">Cliente non trovato.</p>
            )}
          </div>
          
          {/* Altre Azioni */}
          <div className="bg-gray-800 rounded-lg shadow p-5">
            <h3 className="text-lg font-semibold text-white mb-4">Azioni Rapide</h3>
            <button
              onClick={async () => {
                if(window.confirm("Sei sicuro di voler eliminare questo ticket? L'azione è irreversibile.")) {
                  try {
                    const ticketRef = doc(db, `artifacts/${appId}/users/${auth.currentUser.uid}/tickets`, ticketId);
                    await deleteDoc(ticketRef);
                    showNotify("Ticket eliminato!", "success");
                    onNavigate('Riparazioni');
                  } catch (e) {
                    showNotify("Errore eliminazione", "error");
                  }
                }
              }}
              className="w-full flex items-center justify-center p-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
            >
              <Trash2 size={16} className="mr-2" />
              Elimina Riparazione
            </button>
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
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loadingCustomers) {
     return (
      <div className="flex justify-center items-center h-full">
        <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-white">Clienti</h2>
        <button
          onClick={() => onNavigate('CustomerEdit', { customerId: null })}
          className="flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          <UserPlus size={16} className="mr-2" />
          Nuovo Cliente
        </button>
      </div>
      
      <input
        type="text"
        placeholder="Cerca cliente per nome, telefono, email..."
        className="w-full bg-gray-700 text-white placeholder-gray-400 px-4 py-2 rounded-lg mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      <div className="bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Nome</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Telefono</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Azioni</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {filteredCustomers.map(customer => (
              <tr key={customer.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{customer.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{customer.phone}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{customer.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => onNavigate('CustomerEdit', { customerId: customer.id })}
                    className="text-blue-400 hover:text-blue-300"
                  >
                    <Edit size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
         {filteredCustomers.length === 0 && (
           <p className="text-center text-gray-500 py-10">Nessun cliente trovato.</p>
        )}
      </div>
    </div>
  );
};

// Form Cliente
const CustomerForm = ({ customer, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    address: customer?.address || '',
    piva: customer?.piva || '',
    cf: customer?.cf || '',
  });

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="p-6">
      <button onClick={onCancel} className="flex items-center text-sm text-blue-400 hover:text-blue-300 mb-4">
        <ArrowLeft size={16} className="mr-1" />
        Torna ai Clienti
      </button>
      <h2 className="text-2xl font-semibold text-white mb-6">
        {customer ? 'Modifica Cliente' : 'Nuovo Cliente'}
      </h2>
      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300">Nome Completo / Ragione Sociale *</label>
            <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Telefono *</label>
            <input type="tel" name="phone" id="phone" value={formData.phone} onChange={handleChange} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
            <input type="email" name="email" id="email" value={formData.email} onChange={handleChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
           <div>
            <label htmlFor="address" className="block text-sm font-medium text-gray-300">Indirizzo</label>
            <input type="text" name="address" id="address" value={formData.address} onChange={handleChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="piva" className="block text-sm font-medium text-gray-300">P.IVA</label>
            <input type="text" name="piva" id="piva" value={formData.piva} onChange={handleChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label htmlFor="cf" className="block text-sm font-medium text-gray-300">Codice Fiscale</label>
            <input type="text" name="cf" id="cf" value={formData.cf} onChange={handleChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex justify-end space-x-4">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-500">
            Annulla
          </button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
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
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [type, setType] = useState('Entrata');

  const handleAddMovement = async (e) => {
    e.preventDefault();
    if (!dbUserRef || !description || amount <= 0) {
      alert("Compila tutti i campi.");
      return;
    }
    
    try {
      await addDoc(collection(dbUserRef, 'finance'), {
        description,
        amount: parseFloat(amount),
        type,
        date: serverTimestamp(),
        createdBy: appUser.username
      });
      // Reset form
      setDescription('');
      setAmount(0);
      setType('Entrata');
    } catch (e) {
      console.error("Errore aggiunta movimento:", e);
    }
  };

  const deleteMovement = async (id) => {
    if (!dbUserRef || !window.confirm("Sei sicuro di voler eliminare questo movimento?")) return;
    try {
      await deleteDoc(doc(dbUserRef, 'finance', id));
    } catch (e) {
      console.error("Errore eliminazione movimento:", e);
    }
  };

  const totalEntrate = movements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
  const totalUscite = movements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
  const balance = totalEntrate - totalUscite;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-white mb-6">Gestione Finanze</h2>
      
      {/* Riepilogo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-green-800/50 p-4 rounded-lg">
          <p className="text-sm text-green-300">Entrate Totali</p>
          <p className="text-2xl font-bold text-white">€{totalEntrate.toFixed(2)}</p>
        </div>
        <div className="bg-red-800/50 p-4 rounded-lg">
          <p className="text-sm text-red-300">Uscite Totali</p>
          <p className="text-2xl font-bold text-white">€{totalUscite.toFixed(2)}</p>
        </div>
        <div className="bg-gray-700 p-4 rounded-lg">
          <p className="text-sm text-gray-300">Saldo</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-white' : 'text-red-400'}`}>€{balance.toFixed(2)}</p>
        </div>
      </div>
      
      {/* Aggiungi Movimento */}
      <form onSubmit={handleAddMovement} className="bg-gray-800 rounded-lg shadow p-5 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex-grow">
          <label htmlFor="desc" className="block text-sm font-medium text-gray-300">Descrizione</label>
          <input type="text" id="desc" value={description} onChange={e => setDescription(e.target.value)} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="w-full sm:w-auto">
          <label htmlFor="amount" className="block text-sm font-medium text-gray-300">Importo</label>
          <input type="number" step="0.01" id="amount" value={amount} onChange={e => setAmount(e.target.value)} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="w-full sm:w-auto">
          <label htmlFor="type" className="block text-sm font-medium text-gray-300">Tipo</label>
          <select id="type" value={type} onChange={e => setType(e.target.value)} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="Entrata">Entrata</option>
            <option value="Uscita">Uscita</option>
          </select>
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">Aggiungi</button>
      </form>

      {/* Lista Movimenti */}
      <div className="bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Data</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Descrizione</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Importo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Azioni</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan="4" className="text-center p-5 text-gray-500">Caricamento...</td></tr>
            ) : movements.map(m => (
              <tr key={m.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{m.date.toLocaleDateString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{m.description}</td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${m.type === 'Entrata' ? 'text-green-400' : 'text-red-400'}`}>
                  {m.type === 'Entrata' ? '+' : '-'}€{m.amount.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button onClick={() => deleteMovement(m.id)} className="text-red-400 hover:text-red-300">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
         {!loading && movements.length === 0 && (
           <p className="text-center text-gray-500 py-10">Nessun movimento registrato.</p>
        )}
      </div>
    </div>
  );
};


// --- SEZIONE IMPOSTAZIONI (ADMIN) ---
const SettingsView = ({ dbUserRef, appUser }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null); // null per nuovo, altrimenti ID utente

  useEffect(() => {
    if (appUser?.role !== 'Owner' || !dbUserRef) {
      setLoading(false);
      return;
    }
    
    const usersRef = collection(dbUserRef, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Errore caricamento utenti:", error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [dbUserRef, appUser]);

  const handleSaveUser = async (userData) => {
    if (!dbUserRef) return;
    const usersRef = collection(dbUserRef, 'users');
    
    try {
      if (editingUser) {
        // Modifica utente esistente
        await setDoc(doc(usersRef, editingUser.id), userData);
      } else {
        // Crea nuovo utente (usa username come ID)
        await setDoc(doc(usersRef, userData.username), userData);
      }
      setEditingUser(null);
    } catch (e) {
      console.error("Errore salvataggio utente:", e);
    }
  };
  
  const handleDeleteUser = async (userId, username) => {
    if (username === 'owner') {
      alert("Non puoi eliminare l'utente 'owner' principale.");
      return;
    }
    if (!dbUserRef || !window.confirm(`Sei sicuro di voler eliminare l'utente ${username}?`)) return;
    
    try {
      await deleteDoc(doc(dbUserRef, 'users', userId));
    } catch (e) {
      console.error("Errore eliminazione utente:", e);
    }
  };

  if (appUser?.role !== 'Owner') {
    return <div className="p-6 text-red-400">Accesso non autorizzato.</div>;
  }
  
  if (editingUser || editingUser === null) {
    return (
      <UserForm
        user={editingUser}
        onSave={handleSaveUser}
        onCancel={() => setEditingUser(undefined)} // 'undefined' per distinguere da 'null' (nuovo)
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-white">Gestione Utenti</h2>
        <button
          onClick={() => setEditingUser(null)} // 'null' per nuovo utente
          className="flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          <UserPlus size={16} className="mr-2" />
          Nuovo Utente
        </button>
      </div>

      <div className="bg-gray-800 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Username</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Ruolo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">PIN</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Azioni</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {loading ? (
              <tr><td colSpan="4" className="text-center p-5 text-gray-500">Caricamento...</td></tr>
            ) : users.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{user.username}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{user.pin}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-4">
                  <button onClick={() => setEditingUser(user)} className="text-blue-400 hover:text-blue-300"><Edit size={16} /></button>
                  <button onClick={() => handleDeleteUser(user.id, user.username)} className="text-red-400 hover:text-red-300"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Form Utente
const UserForm = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    password: user?.password || '',
    role: user?.role || 'Tecnico',
    pin: user?.pin || '',
  });
  
  const isEditing = !!user;

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="p-6">
      <button onClick={onCancel} className="flex items-center text-sm text-blue-400 hover:text-blue-300 mb-4">
        <ArrowLeft size={16} className="mr-1" />
        Torna agli Utenti
      </button>
      <h2 className="text-2xl font-semibold text-white mb-6">
        {isEditing ? 'Modifica Utente' : 'Nuovo Utente'}
      </h2>
      <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg shadow p-6 max-w-lg mx-auto space-y-4">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-300">Username *</label>
          <input type="text" name="username" id="username" value={formData.username} onChange={handleChange} required disabled={isEditing} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password *</label>
          <input type="password" name="password" id="password" value={formData.password} onChange={handleChange} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-gray-300">Ruolo *</label>
          <select name="role" id="role" value={formData.role} onChange={handleChange} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="Tecnico">Tecnico</option>
            <option value="Owner">Owner</option>
          </select>
        </div>
        <div>
          <label htmlFor="pin" className="block text-sm font-medium text-gray-300">PIN (per sblocco rapido)</label>
          <input type="text" name="pin" id="pin" value={formData.pin} onChange={handleChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex justify-end space-x-4">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg bg-gray-600 text-white hover:bg-gray-500">
            Annulla
          </button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            Salva Utente
          </button>
        </div>
      </form>
    </div>
  );
};


// --- SEZIONE NUOVA RIPARAZIONE ---
const NewRepairForm = ({ dbUserRef, appUser, onNavigate, customers, loadingCustomers, technicians, showNotify }) => {
  const [step, setStep] = useState(1); // 1: Cliente, 2: Dispositivo
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dati Cliente (per step 1, se nuovo)
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  
  // Dati Riparazione (per step 2)
  const [repairData, setRepairData] = useState({
    deviceName: '',
    imei: '',
    password: '',
    problemDescription: '',
    technician: appUser?.username || '',
    price: 0,
    status: 'In Coda'
  });

  const handleCustomerChange = (e) => {
    setNewCustomer(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };
  
  const handleRepairChange = (e) => {
    setRepairData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 10); // Limita a 10 risultati

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setSearchTerm(customer.name);
  };

  const goToStep2 = async () => {
    let customerId = selectedCustomer?.id;
    
    // Se non c'è un cliente selezionato, prova a creare quello nuovo
    if (!selectedCustomer) {
      if (!newCustomer.name || !newCustomer.phone) {
        showNotify("Nome e Telefono sono obbligatori per un nuovo cliente.", "error");
        return;
      }
      // Crea nuovo cliente
      try {
        const docRef = await addDoc(collection(dbUserRef, 'customers'), {
          ...newCustomer,
          createdAt: serverTimestamp()
        });
        customerId = docRef.id;
      } catch (e) {
        console.error("Errore creazione cliente:", e);
        showNotify("Errore creazione cliente.", "error");
        return;
      }
    }
    
    // Salva l'ID cliente per lo step 2 e avanza
    setRepairData(prev => ({ ...prev, customerId: customerId, customerName: selectedCustomer?.name || newCustomer.name }));
    setStep(2);
  };

  const handleSubmitRepair = async (e) => {
    e.preventDefault();
    if (!repairData.deviceName || !repairData.problemDescription) {
      showNotify("Dispositivo e Problema sono obbligatori.", "error");
      return;
    }

    try {
      // Genera un ID Ticket univoco (es: MA0001)
      const prefix = (appUser?.username.substring(0, 2) || 'AA').toUpperCase();
      // Per un ID univoco reale servirebbe un contatore su Firestore (complesso)
      // Usiamo un ID più semplice per ora:
      const ticketId = `${prefix}${Date.now().toString().slice(-6)}`;
      
      const fullTicketData = {
        ...repairData,
        ticketId: ticketId,
        price: parseFloat(repairData.price),
        createdAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(collection(dbUserRef, 'tickets'), fullTicketData);
      
      showNotify("Riparazione creata con successo!", "success");
      onNavigate('RepairDetail', { ticketId: docRef.id });

    } catch (e) {
      console.error("Errore creazione riparazione:", e);
      showNotify("Errore creazione riparazione.", "error");
    }
  };

  // Step 1: Selezione/Creazione Cliente
  if (step === 1) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold text-white mb-6">Nuova Riparazione (1/2): Cliente</h2>
        
        {/* Cerca Cliente Esistente */}
        <div className="bg-gray-800 rounded-lg shadow p-5 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Cerca Cliente Esistente</h3>
          <input
            type="text"
            placeholder="Cerca per nome o telefono..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedCustomer(null); // Resetta se si cerca
            }}
            className="w-full bg-gray-700 text-white px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchTerm && !selectedCustomer && (
            <div className="mt-2 bg-gray-900 rounded-lg max-h-40 overflow-y-auto">
              {loadingCustomers ? <p className="p-3 text-gray-500">Caricamento...</p> :
                filteredCustomers.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className="block w-full text-left p-3 hover:bg-gray-700"
                  >
                    {c.name} - {c.phone}
                  </button>
                ))
              }
              {filteredCustomers.length === 0 && !loadingCustomers && (
                <p className="p-3 text-gray-500">Nessun cliente trovato. Creane uno nuovo.</p>
              )}
            </div>
          )}
          {selectedCustomer && (
            <p className="mt-3 text-green-400">Cliente selezionato: {selectedCustomer.name}</p>
          )}
        </div>
        
        {/* O Crea Nuovo Cliente */}
        <div className="bg-gray-800 rounded-lg shadow p-5">
          <h3 className="text-lg font-semibold text-white mb-4">Oppure Creane Uno Nuovo</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300">Nome Completo *</label>
              <input type="text" name="name" id="name" value={newCustomer.name} onChange={handleCustomerChange} disabled={!!selectedCustomer} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg disabled:opacity-50" />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-300">Telefono *</label>
              <input type="tel" name="phone" id="phone" value={newCustomer.phone} onChange={handleCustomerChange} disabled={!!selectedCustomer} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg disabled:opacity-50" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
              <input type="email" name="email" id="email" value={newCustomer.email} onChange={handleCustomerChange} disabled={!!selectedCustomer} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg disabled:opacity-50" />
            </div>
          </div>
        </div>
        
        <button
          onClick={goToStep2}
          disabled={!selectedCustomer && (!newCustomer.name || !newCustomer.phone)}
          className="w-full mt-6 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-600"
        >
          Avanti
        </button>
      </div>
    );
  }

  // Step 2: Dettagli Riparazione
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <button onClick={() => setStep(1)} className="flex items-center text-sm text-blue-400 hover:text-blue-300 mb-4">
        <ArrowLeft size={16} className="mr-1" />
        Torna al Cliente
      </button>
      <h2 className="text-2xl font-semibold text-white mb-6">Nuova Riparazione (2/2): Dispositivo</h2>
      <p className="text-gray-400 mb-4">Cliente: {repairData.customerName}</p>
      
      <form onSubmit={handleSubmitRepair} className="bg-gray-800 rounded-lg shadow p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="deviceName" className="block text-sm font-medium text-gray-300">Dispositivo *</label>
            <input type="text" name="deviceName" id="deviceName" value={repairData.deviceName} onChange={handleRepairChange} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg" />
          </div>
          <div>
            <label htmlFor="imei" className="block text-sm font-medium text-gray-300">IMEI / Seriale</label>
            <input type="text" name="imei" id="imei" value={repairData.imei} onChange={handleRepairChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">Password Sblocco</label>
            <input type="text" name="password" id="password" value={repairData.password} onChange={handleRepairChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg" />
          </div>
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-gray-300">Prezzo Iniziale</label>
            <input type="number" step="0.01" name="price" id="price" value={repairData.price} onChange={handleRepairChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg" />
          </div>
          {appUser.role === 'Owner' && (
             <div>
              <label htmlFor="technician" className="block text-sm font-medium text-gray-300">Assegna a Tecnico</label>
              <select name="technician" id="technician" value={repairData.technician} onChange={handleRepairChange} className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg">
                <option value={appUser.username}>{appUser.username} (Tu)</option>
                {technicians.filter(t => t.username !== appUser.username).map(tech => (
                  <option key={tech.id} value={tech.username}>{tech.username}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="problemDescription" className="block text-sm font-medium text-gray-300">Problema Segnalato *</label>
          <textarea name="problemDescription" id="problemDescription" value={repairData.problemDescription} onChange={handleRepairChange} rows={4} required className="w-full mt-1 bg-gray-700 text-white px-3 py-2 rounded-lg"></textarea>
        </div>
        <button
          type="submit"
          className="w-full mt-6 py-3 px-4 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700"
        >
          Crea Riparazione
        </button>
      </form>
    </div>
  );
};



// --- COMPONENTE PRINCIPALE APP ---

// Notifiche (Toast)
const Notification = ({ message, type, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true); // Entra
    const timer = setTimeout(() => {
      setVisible(false); // Esce
      setTimeout(onClose, 300); // Rimuove dopo transizione
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-blue-600');

  return (
    <div
      className={`fixed top-5 right-5 z-50 p-4 rounded-lg shadow-lg text-white ${bgColor} transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'
      }`}
    >
      {message}
    </div>
  );
};

// Funzione helper per ottenere tutti gli admin/owner (per visibilità ticket)
const useAllAdmins = (dbUserRef) => {
  const [admins, setAdmins] = useState([]);
  useEffect(() => {
    if (!dbUserRef) return;
    const q = query(collection(dbUserRef, 'users'), where('role', 'in', ['Owner', 'Admin']));
    const unsub = onSnapshot(q, (snapshot) => {
      setAdmins(snapshot.docs.map(d => d.data()));
    });
    return () => unsub();
  }, [dbUserRef]);
  return admins;
};

// --- STRUTTURA DI AVVIO CORRETTA ---

// 1. Creiamo un componente "figlio" che consumerà il contesto
function AppContent() {
  const { authReady, appUser, login, error, loading, dbUserRef } = useContext(AuthContext);
  
  // Stato di navigazione
  const [currentView, setCurrentView] = useState('Dashboard');
  const [viewParams, setViewParams] = useState(null);
  
  // Stato notifiche
  const [notification, setNotification] = useState(null);
  
  // Hooks dati globali
  const { customers, loading: loadingCustomers } = useCustomers(dbUserRef);
  const { technicians, loading: loadingTechnicians } = useTechnicians(dbUserRef, appUser);
  const allAdmins = useAllAdmins(dbUserRef);
  
  const showNotify = (message, type = 'info') => {
    setNotification({ id: Date.now(), message, type });
  };

  const handleNavigate = (view, params = null) => {
    setCurrentView(view);
    setViewParams(params);
  };
  
  // Mostra caricamento finché Firebase non è pronto
  if (!authReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <svg className="animate-spin h-10 w-10 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  // Se Firebase è pronto ma non c'è login, mostra LoginScreen
  if (!appUser) {
    return <LoginScreen onLogin={login} error={error} loading={loading} />;
  }

  // Se loggato, renderizza l'app principale
  const renderView = () => {
    switch (currentView) {
      case 'Dashboard':
        return <DashboardView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={technicians} // Passa tecnici come utenti gestiti
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
      case 'RepairDetail':
        return <RepairDetailView
                  ticketId={viewParams.ticketId}
                  onNavigate={handleNavigate}
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  customers={customers}
                  technicians={technicians}
                  showNotify={showNotify}
                  settings={null} // Da implementare se necessario
                />;
      case 'Clienti':
        return <CustomerView 
                  dbUserRef={dbUserRef}
                  onNavigate={handleNavigate}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                />;
      case 'CustomerEdit':
        const customer = viewParams?.customerId ? customers.find(c => c.id === viewParams.customerId) : null;
        return <CustomerForm
                  customer={customer}
                  onSave={async (formData) => {
                    try {
                      if (customer) {
                        // Modifica
                        await updateDoc(doc(dbUserRef, 'customers', customer.id), formData);
                      } else {
                        // Nuovo
                        await addDoc(collection(dbUserRef, 'customers'), {
                          ...formData,
                          createdAt: serverTimestamp()
                        });
                      }
                      showNotify("Cliente salvato!", "success");
                      onNavigate('Clienti');
                    } catch (e) {
                      showNotify("Errore salvataggio cliente", "error");
                    }
                  }}
                  onCancel={() => onNavigate('Clienti')}
                />;
      case 'Finanze':
        return <FinanceView 
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  managedUsers={technicians}
                />;
      case 'Impostazioni':
        return <SettingsView 
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                />;
      case 'NewRepair':
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
                  managedUsers={technicians}
                  onNavigate={handleNavigate} 
                  allAdmins={allAdmins}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        onLogout={useContext(AuthContext).logout}
        appUser={appUser}
      />
      
      <main className="flex-1 md:ml-64 flex flex-col overflow-y-auto bg-gray-950">
        <div className="pt-16 md:pt-0"> {/* Padding top per header mobile */}
          {renderView()}
        </div>
      </main>
    </div>
  );
}


// 2. L'export di default è il "Provider" che carica i dati
export default function App() {
  const authData = useAuth(); // Esegui l'hook

  return (
    // Fornisci i dati di autenticazione all'intera app
    <AuthContext.Provider value={authData}>
      <AppContent /> 
    </AuthContext.Provider>
  );
}
