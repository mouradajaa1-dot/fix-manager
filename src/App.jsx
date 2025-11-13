import React, { useState, useEffect, useRef, createContext, useContext, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  onAuthStateChanged, 
  signInAnonymously 
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
  Megaphone, // Icona per Avvisi
  ArrowLeft, // Per tornare indietro
  UserSquare, // Per Cliente
  Smartphone, // Per Dispositivo
  Info, // Per Dettagli
  Book, // Per Note
  ShieldCheck, // Per Garanzia
  Clock, // Per Arrivo
  CreditCard, // Per Acconto
  BatteryCharging, // Icone Problemi
  Droplet,
  MicOff,
  Speaker,
  CameraOff,
  WifiOff,
  ScreenShare,
  FileText, // Per Scontrino/POS
  Receipt // Icona POS
} from 'lucide-react';

// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

let db;
let auth;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  // Abilita i log di Firestore per il debug
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
    const performAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Errore di autenticazione:", e);
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
    const usersCollection = collection(db, `artifacts/${appId}/users/${userId}/users`);
    const q = query(usersCollection);
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log("Nessun utente trovato, creo i default...");
      // Utente 1: Owner (TU)
      const ownerData = {
        username: 'owner',
        password: 'owner', // NOTA: Mai salvare password in chiaro in prod! Solo per demo.
        role: 'Owner',
        createdBy: 'system'
      };
      await addDoc(usersCollection, ownerData);
      
      // Utente 2: Tecnico (Majaabou)
      const techData = {
        username: 'majaabou',
        password: '00000000',
        role: 'Tecnico',
        createdBy: 'system' // Creato dal sistema (o dall'owner di default)
      };
      await addDoc(usersCollection, techData);
    }
  };


  const login = async (username, password) => {
    setError('');
    setLoading(true);
    if (!dbUserRef) {
      setError("Database non pronto.");
      setLoading(false);
      return;
    }

    const usersCollection = collection(dbUserRef, 'users');
    const q = query(usersCollection, where("username", "==", username), where("password", "==", password));
    
    try {
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        setError("Credenziali non valide.");
      } else {
        const userDoc = querySnapshot.docs[0];
        const userData = { id: userDoc.id, ...userDoc.data() };
        setAppUser(userData);
        // Salva lo stato di login nel DB
        await setDoc(doc(dbUserRef, 'state', 'appLogin'), { loggedIn: true, user: userData });
      }
    } catch (e) {
      console.error("Errore durante il login:", e);
      setError("Errore di connessione.");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setAppUser(null);
    if (dbUserRef) {
      // Resetta lo stato di login nel DB
      await setDoc(doc(dbUserRef, 'state', 'appLogin'), { loggedIn: false, user: null });
    }
  };

  return { authReady, currentUser, appUser, loading, error, login, logout, dbUserRef };
};

// --- HOOKS DATI ---

const useUsers = (dbUserRef, appUser) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef || !appUser) {
      setLoading(false);
      setUsers([]);
      return;
    }

    setLoading(true);
    const usersCollection = collection(dbUserRef, 'users');
    
    let q;
    if (appUser.role === 'Owner') {
      // Owner vede tutti tranne se stesso (per la gestione)
      q = query(usersCollection, where("username", "!=", "owner"));
    } else if (appUser.role === 'Admin') {
      // Admin vede solo i tecnici che ha creato
      q = query(usersCollection, where("createdBy", "==", appUser.id), where("role", "==", "Tecnico"));
    } else {
      // Tecnico non vede questa pagina
      q = query(usersCollection, where("username", "==", "")); // Query vuota
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(usersData);
      setLoading(false);
    }, (error) => {
      console.error("Errore snapshot users:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser]);
  
  // Aggiunto controllo per appUser nullo prima di accedere a .role
  if (!appUser) {
    return { users: [], technicians: [], loading: loading, managedUsers: [] };
  }

  // Solo Admin e Owner possono avere tecnici
  const technicians = (appUser.role === 'Admin' || appUser.role === 'Owner') 
    ? users.filter(u => u.role === 'Tecnico') 
    : [];
    
  // Aggiungiamo anche l'utente stesso alla lista dei tecnici, se è un tecnico
  if (appUser.role === 'Tecnico') {
      technicians.push(appUser);
  }
  // L'owner può assegnare a tutti, l'admin solo ai suoi
  const assignableTechnicians = appUser.role === 'Owner' 
      ? users.filter(u => u.role === 'Tecnico' || u.role === 'Admin') // Owner può assegnare anche ad Admin
      : [appUser, ...technicians]; // Admin può assegnare a se stesso o ai suoi tecnici

  const managedUsers = users; 
  
  const allAdmins = (appUser.role === 'Owner')
    ? users.filter(u => u.role === 'Admin')
    : [];

  return { users: managedUsers, technicians: assignableTechnicians, loading, managedUsers, allAdmins };
};

const useCustomers = (dbUserRef, appUser) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef || !appUser) {
      setLoading(true);
      setCustomers([]);
      return;
    }
    setLoading(true);
    const customersCollection = collection(dbUserRef, 'customers');
    
    let q;
    if (appUser.role === 'Owner') {
      // Owner vede tutti
      q = query(customersCollection);
    } else if (appUser.role === 'Admin') {
      // Admin vede solo i clienti del suo team
      q = query(customersCollection, where("teamId", "==", appUser.id));
    } else { // Tecnico
      // I tecnici vedono i clienti del loro admin
      q = query(customersCollection, where("teamId", "==", appUser.createdBy));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomers(customersData);
      setLoading(false);
    }, (error) => {
      console.error("Errore snapshot customers:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser]); // Aggiunto appUser come dipendenza

  return { customers, loading };
};

const useSettings = (dbUserRef) => {
  const [settings, setSettings] = useState({ customerLimit: 100 }); // Limite di default
  const [loading, setLoading] = useState(true);
  
  const settingsRef = useMemo(() => 
    dbUserRef ? doc(dbUserRef, 'settings', 'main') : null, 
    [dbUserRef]
  );

  useEffect(() => {
    if (!settingsRef) {
      setLoading(true);
      return;
    }
    setLoading(true);
    
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        setDoc(settingsRef, { customerLimit: 100 });
        setSettings({ customerLimit: 100 }); 
      }
      setLoading(false);
    }, (error) => {
      console.error("Errore snapshot settings:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [settingsRef]);
  
  const saveSettings = async (newSettings) => {
    if (settingsRef) {
      await setDoc(settingsRef, newSettings, { merge: true });
    }
  };

  return { settings, loading, saveSettings };
};

// *** MODIFICATO *** Hook Avvisi
const useAnnouncements = (dbUserRef, appUser) => {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const announcementsCollection = useMemo(() =>
        dbUserRef ? collection(dbUserRef, 'announcements') : null,
        [dbUserRef]
    );

    useEffect(() => {
        if (!announcementsCollection || !appUser) {
            setLoading(false);
            return;
        }
        
        if (appUser.role !== 'Admin' && appUser.role !== 'Owner') {
            setLoading(false);
            return;
        }

        setLoading(true);
        
        // Admin: Vede i globali O quelli dove è target
        // Owner: Vede tutto (per debug, anche se non serve)
        let q;
        if (appUser.role === 'Admin') {
            q = query(announcementsCollection,
                or(
                    where("targetAdmins", "==", []), // Globali
                    where("targetAdmins", "array-contains", appUser.id) // Mirati
                ),
                limit(10)
            );
        } else { // Owner
             q = query(announcementsCollection, limit(10));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setAnnouncements(data);
            setLoading(false);
        }, (error) => {
            console.error("Errore snapshot announcements:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [announcementsCollection, appUser]);
    
    // *** MODIFICATO *** Invia Avviso
    const sendAnnouncement = async (message, targetAdmins = []) => {
        if (announcementsCollection && appUser.role === 'Owner') {
            await addDoc(announcementsCollection, {
                message: message,
                sentBy: appUser.username,
                createdAt: new Date(),
                targetAdmins: targetAdmins // Array di ID admin (vuoto se globale)
            });
        }
    };

    return { announcements, loading, sendAnnouncement };
};


// --- COMPONENTI UI ---

const ICONS = {
  Dashboard: <LayoutDashboard size={18} />,
  Repairs: <Wrench size={18} />,
  Team: <Users size={18} />,
  Finance: <DollarSign size={18} />,
  Customers: <Contact size={18} />,
  Settings: <Settings size={18} />,
  Logout: <LogOut size={18} />,
  Add: <Plus size={16} />,
  Open: <ChevronRight size={16} />,
  Closed: <ChevronDown size={16} />,
  More: <MoreVertical size={18} />,
  Delete: <Trash2 size={16} className="text-red-500" />,
  Edit: <Edit size={16} className="text-blue-500" />,
  Complete: <CheckSquare size={16} className="text-green-500" />,
  Print: <Printer size={16} className="text-gray-600" />,
  Share: <Share2 size={16} className="text-blue-500" />,
  Close: <X size={20} />,
  Warning: <AlertCircle size={20} className="text-red-500" />,
  Copy: <ClipboardCopy size={16} />,
  Send: <Send size={16} />,
  Email: <Mail size={16} />,
  Ready: <Package size={16} className="text-blue-500" />,
  Delivered: <Handshake size={16} className="text-purple-500" />,
  Queue: <Archive size={16} className="text-gray-500" />,
  Working: <Truck size={16} className="text-yellow-500" />,
  Login: <Lock size={16} />,
  EyeOn: <Eye size={18} />,
  EyeOff: <EyeOff size={18} />,
  Admin: <Building size={18} />,
  Tech: <User size={18} />,
  AddUser: <UserPlus size={18} />,
  History: <History size={16} className="text-gray-600" />,
  Calendar: <Calendar size={18} />,
  Announcement: <Megaphone size={16} />,
  Back: <ArrowLeft size={18} />,
  Customer: <UserSquare size={18} />,
  Device: <Smartphone size={18} />,
  Details: <Info size={18} />,
  Notes: <Book size={18} />,
  Warranty: <ShieldCheck size={18} />,
  Clock: <Clock size={16} />,
  Acconto: <CreditCard size={16} />,
  // Icone Problemi
  Screen: <ScreenShare size={18} />,
  Water: <Droplet size={18} />,
  Battery: <BatteryCharging size={18} />,
  Charging: <BatteryCharging size={18} />,
  NoPower: <X size={18} />,
  Mic: <MicOff size={18} />,
  Camera: <CameraOff size={18} />,
  Other: <Wrench size={18} />,
  POS: <Receipt size={18} />,
};

// Schermata di Login
const LoginScreen = ({ onLogin, error, loading }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(username, password);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-lg shadow-xl">
        <div className="flex justify-center mb-6">
          <Wrench size={40} className="text-indigo-600" />
        </div>
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-6">FixManager</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500"
              >
                {showPass ? ICONS.EyeOff : ICONS.EyeOn}
              </button>
            </div>
          </div>
          {error && (
            <div className="mb-4 text-center text-red-600 bg-red-100 p-2 rounded-lg">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline transition-colors duration-200 disabled:bg-indigo-400"
          >
            {loading ? 'Accesso...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

// Sidebar
const Sidebar = ({ appUser, onLogout, onNavigate, activeView }) => {
  const { role } = appUser;
  
  const navItems = [
    { name: 'Dashboard', icon: ICONS.Dashboard, roles: ['Owner', 'Admin', 'Tecnico'] },
    { name: 'Riparazioni', icon: ICONS.Repairs, roles: ['Owner', 'Admin', 'Tecnico'] },
    { name: 'Clienti', icon: ICONS.Customers, roles: ['Owner', 'Admin'] },
    { name: 'Cassa', icon: ICONS.Finance, roles: ['Owner', 'Admin'] },
    { name: 'Team', icon: ICONS.Team, roles: ['Owner', 'Admin'] },
    { name: 'Impostazioni', icon: ICONS.Settings, roles: ['Owner'] },
  ];

  const getRoleColor = (role) => {
    switch (role) {
      case 'Owner': return 'bg-red-600';
      case 'Admin': return 'bg-blue-600';
      case 'Tecnico': return 'bg-yellow-600';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="w-64 h-screen bg-gray-900 text-white flex flex-col fixed">
      <div className="flex items-center justify-center h-20 border-b border-gray-700">
        <Wrench size={24} className="mr-2 text-indigo-400" />
        <h1 className="text-2xl font-bold">FixManager</h1>
      </div>
      <nav className="flex-grow px-4 py-6 space-y-2">
        {navItems.map((item) => (
          item.roles.includes(role) && (
            <button
              key={item.name}
              onClick={() => onNavigate(item.name)}
              className={`flex items-center w-full px-4 py-3 rounded-lg transition-colors duration-200 ${
                activeView === item.name
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {item.icon}
              <span className="ml-4">{item.name}</span>
            </button>
          )
        ))}
      </nav>
      <div className="border-t border-gray-700 p-4">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
            {appUser.username.charAt(0).toUpperCase()}
          </div>
          <div className="ml-3">
            <p className="font-semibold">{appUser.username}</p>
            <span className={`px-2 py-0.5 text-xs font-bold rounded ${getRoleColor(role)} text-white`}>
              {role}
            </span>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center w-full px-4 py-3 mt-4 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors duration-200"
        >
          {ICONS.Logout}
          <span className="ml-4">Logout</span>
        </button>
      </div>
    </div>
  );
};

// Modal Generico
const Modal = ({ isOpen, onClose, title, children, size = 'lg' }) => {
  if (!isOpen) return null;
  const sizes = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl', // Aggiunto per modal più larghi
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40 flex justify-center items-center p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${sizes[size]} m-4`}>
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            {ICONS.Close}
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};

// Modal Conferma Eliminazione
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => (
  <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
    <div className="flex items-center mb-4">
      {ICONS.Warning}
      <p className="ml-3 text-gray-700">{message}</p>
    </div>
    <div className="flex justify-end space-x-3 mt-6">
      <button
        onClick={onClose}
        className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
      >
        Annulla
      </button>
      <button
        onClick={onConfirm}
        className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium"
      >
        Conferma
      </button>
    </div>
  </Modal>
);

// Notifica Toast
const Notification = ({ text, show, onHide }) => {
  if (!show) return null;
  return (
    <div className="fixed top-20 right-6 bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 animate-bounce">
      {text}
    </div>
  );
};

// --- SEZIONE CLIENTI (CUSTOMERVIEW) ---

const CustomerModal = ({ isOpen, onClose, onSave, editingCustomer }) => {
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '', notes: '' });

  useEffect(() => {
    if (editingCustomer) {
      setCustomer(editingCustomer);
    } else {
      setCustomer({ name: '', phone: '', email: '', notes: '' });
    }
  }, [editingCustomer, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCustomer(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(customer);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingCustomer ? "Modifica Cliente" : "Nuovo Cliente"} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input name="name" value={customer.name} onChange={handleChange} placeholder="Nome Cliente" className="w-full p-2 border rounded-lg" required />
        <input name="phone" value={customer.phone} onChange={handleChange} placeholder="Telefono" className="w-full p-2 border rounded-lg" />
        <input name="email" value={customer.email} onChange={handleChange} placeholder="Email" className="w-full p-2 border rounded-lg" />
        <textarea name="notes" value={customer.notes} onChange={handleChange} placeholder="Note (es. indirizzo)" className="w-full p-2 border rounded-lg h-24" />
        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Annulla</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">Salva Cliente</button>
        </div>
      </form>
    </Modal>
  );
};

const CustomerView = ({ dbUserRef, appUser, settings, customers, loadingCustomers, showNotify }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const customersCollection = collection(dbUserRef, 'customers');

  const handleSaveCustomer = async (customerData) => {
    if (editingCustomer) {
      // Modifica
      try {
        const customerRef = doc(customersCollection, editingCustomer.id);
        await updateDoc(customerRef, customerData);
        showNotify("Cliente aggiornato!");
      } catch (e) {
        console.error("Errore aggiornamento cliente:", e);
        showNotify("Errore aggiornamento.");
      }
    } else {
      // Nuovo
      // Controlla Limite Clienti
      if (customers.length >= (settings.customerLimit || 100)) {
        showNotify("Limite clienti raggiunto! Aggiorna il piano in Impostazioni.");
        return;
      }
      try {
        let teamId;
        if (appUser.role === 'Owner') teamId = appUser.id;
        else if (appUser.role === 'Admin') teamId = appUser.id;
        else teamId = appUser.createdBy; // Tecnico
        
        const customerToSave = {
            ...customerData,
            teamId: teamId
        };
        
        await addDoc(customersCollection, customerToSave);
        showNotify("Cliente aggiunto!");
      } catch (e) {
        console.error("Errore aggiunta cliente:", e);
        showNotify("Errore aggiunta.");
      }
    }
    setIsModalOpen(false);
    setEditingCustomer(null);
  };

  const openDeleteConfirm = (customer) => {
    setCustomerToDelete(customer);
    setIsConfirmOpen(true);
  };

  const handleDeleteCustomer = async () => {
    if (customerToDelete) {
      try {
        // TODO: Controllare se il cliente ha riparazioni attive prima di eliminare
        await deleteDoc(doc(customersCollection, customerToDelete.id));
        showNotify("Cliente eliminato.");
      } catch (e) {
        console.error("Errore eliminazione cliente:", e);
        showNotify("Errore eliminazione.");
      }
      setIsConfirmOpen(false);
      setCustomerToDelete(null);
    }
  };
  
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Registro Clienti</h2>
        <button
          onClick={() => { setEditingCustomer(null); setIsModalOpen(true); }}
          className="flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          {ICONS.AddUser}
          <span className="ml-2">Nuovo Cliente</span>
        </button>
      </div>
      
      <div className="mb-4">
        <input 
          type="text"
          placeholder="Cerca cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded-lg"
        />
      </div>

      {loadingCustomers ? (
        <p>Caricamento...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nome</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Contatti</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Note</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCustomers.map(customer => (
                <tr key={customer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{customer.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div>{customer.phone}</div>
                    <div>{customer.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{customer.notes}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button onClick={() => { setEditingCustomer(customer); setIsModalOpen(true); }} className="p-2 rounded-full text-blue-500 hover:bg-blue-100">
                      {ICONS.Edit}
                    </button>
                    <button onClick={() => openDeleteConfirm(customer)} className="p-2 rounded-full text-red-500 hover:bg-red-100">
                      {ICONS.Delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      <CustomerModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCustomer}
        editingCustomer={editingCustomer}
      />
      
      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteCustomer}
        title="Conferma Eliminazione"
        message={`Sei sicuro di voler eliminare ${customerToDelete?.name}? Tutte le riparazioni associate potrebbero essere affette.`}
      />
    </div>
  );
};


// --- SEZIONE IMPOSTAZIONI (SETTINGSVIEW) ---

const SettingsView = ({ settings, loadingSettings, saveSettings, showNotify }) => {
  const [customerLimit, setCustomerLimit] = useState(100);

  useEffect(() => {
    if (settings) {
      setCustomerLimit(settings.customerLimit || 100);
    }
  }, [settings]);

  const handleSave = () => {
    saveSettings({ customerLimit: parseInt(customerLimit, 10) });
    showNotify("Impostazioni salvate!");
  };

  if (loadingSettings) return <p>Caricamento impostazioni...</p>;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Impostazioni (Owner)</h2>
      
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-lg">
        <h3 className="text-base font-semibold text-gray-700 mb-4">Gestione Limiti</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2" htmlFor="customerLimit">
              Limite Clienti Registrabili
            </label>
            <input
              id="customerLimit"
              type="number"
              value={customerLimit}
              onChange={(e) => setCustomerLimit(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">Numero massimo di clienti che possono essere salvati nel registro.</p>
          </div>
          
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-medium"
            >
              Salva Impostazioni
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- SEZIONE RIPARAZIONI (REPAIRVIEW) ---

const useTickets = (dbUserRef, appUser, managedUsers) => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef || !appUser) {
      setLoading(false); 
      setTickets([]);
      return;
    }

    setLoading(true);
    const ticketsCollection = collection(dbUserRef, 'tickets');
    
    let q;
    if (appUser.role === 'Owner') {
      q = query(ticketsCollection);
    } else if (appUser.role === 'Admin') {
      const visibleIds = [appUser.id, ...managedUsers.map(u => u.id)];
      q = query(ticketsCollection, where("createdBy", "in", visibleIds));
    } else {
      q = query(ticketsCollection, where("technician", "==", appUser.username));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      ticketsData.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setTickets(ticketsData);
      setLoading(false);
    }, (error) => {
      console.error("Errore snapshot tickets:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser, managedUsers]);

  return { tickets, loading };
};

// *** MODIFICATO *** Stato di default per il Ticket
const DEFAULT_TICKET_STATE = {
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    deviceCategory: '',
    deviceBrand: '',
    deviceModel: '',
    deviceCodeType: 'Nessuno',
    deviceCodeValue: '',
    imei: '',
    accessories: '',
    aestheticCondition: '',
    cloudUser: '',
    cloudPass: '',
    issueType: '',
    issueDescription: '',
    price: '',
    acconto: 0,
    status: 'In Coda',
    technician: ''
};

// *** NUOVO *** Dati per la selezione del dispositivo
const deviceData = {
    'Cellulare': {
        'Apple': ['iPhone 15 Pro Max', 'iPhone 15', 'iPhone 14 Pro', 'iPhone 14', 'iPhone 13', 'iPhone 12', 'iPhone 11', 'iPhone X', 'iPhone XS', 'Altro...'],
        'Samsung': ['Galaxy S24', 'Galaxy S23', 'Galaxy S22', 'Galaxy A54', 'Galaxy Z Fold 5', 'Galaxy Z Flip 5', 'Altro...'],
        'Google': ['Pixel 8 Pro', 'Pixel 8', 'Pixel 7a', 'Pixel 7', 'Altro...'],
        'Xiaomi': ['14 Ultra', '14', '13T Pro', 'Redmi Note 13', 'Altro...'],
        'Altro...': ['Altro...']
    },
    'Computer': {
        'Apple': ['MacBook Pro 14"', 'MacBook Pro 16"', 'MacBook Air M3', 'MacBook Air M2', 'iMac 24"', 'Altro...'],
        'HP': ['Pavilion G780', 'Spectre x360', 'Envy 15', 'Omen 16', 'Altro...'],
        'Dell': ['XPS 13', 'XPS 15', 'XPS 17', 'Alienware M16', 'Altro...'],
        'Lenovo': ['Yoga 9i', 'ThinkPad X1', 'Legion 5', 'Altro...'],
        'Altro...': ['Altro...']
    },
    'Tablet': {
        'Apple': ['iPad Pro 12.9"', 'iPad Pro 11"', 'iPad Air 5', 'iPad Mini 6', 'iPad (10a gen)', 'Altro...'],
        'Samsung': ['Galaxy Tab S9 Ultra', 'Galaxy Tab S9', 'Galaxy Tab A9+', 'Altro...'],
        'Altro...': ['Altro...']
    },
    'Smartwatch': {
        'Apple': ['Watch Ultra 2', 'Watch Series 9', 'Watch SE', 'Altro...'],
        'Samsung': ['Galaxy Watch 6', 'Galaxy Watch 5 Pro', 'Altro...'],
        'Altro...': ['Altro...']
    },
    'Altro...': {
        'Altro...': ['Altro...']
    }
};

// *** NUOVO *** Opzioni per il problema
const issueOptions = [
    'Schermo rotto',
    'Danni da acqua',
    'Batteria',
    'Problema Ricarica',
    'Non si accende',
    'Microfono',
    'Fotocamera',
    'Altro...'
];

const TicketModal = ({ isOpen, onClose, onSave, technicians, editingTicket, appUser, customers, settings, showNotify, dbUserRef }) => {
  
  const [ticketData, setTicketData] = useState(DEFAULT_TICKET_STATE);
  
  // Stati per select dipendenti
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  
  // ID del cliente trovato o creato
  const [linkedCustomerId, setLinkedCustomerId] = useState(null);

  useEffect(() => {
    if (editingTicket) {
        // Se modifichiamo, carichiamo i dati
        const customer = customers.find(c => c.id === editingTicket.customerId);
        
        // Assicura che tutti i campi siano presenti
        const populatedData = { ...DEFAULT_TICKET_STATE, ...editingTicket };
        
        // Popola i dati del cliente se trovati
        if(customer) {
            populatedData.customerName = customer.name;
            populatedData.customerPhone = customer.phone;
            populatedData.customerEmail = customer.email;
        }
        
        setTicketData(populatedData);
        setLinkedCustomerId(editingTicket.customerId);

        // Popola i menu a tendina dipendenti
        if(populatedData.deviceCategory) {
            const newBrands = deviceData[populatedData.deviceCategory] ? Object.keys(deviceData[populatedData.deviceCategory]) : [];
            setBrands(newBrands);
        }
        if(populatedData.deviceCategory && populatedData.deviceBrand) {
            const newModels = deviceData[populatedData.deviceCategory]?.[populatedData.deviceBrand] || [];
            setModels(newModels);
        }
        
    } else {
      // Reset per nuovo ticket
      setTicketData(DEFAULT_TICKET_STATE);
      setLinkedCustomerId(null);
      setBrands([]);
      setModels([]);
    }
  }, [editingTicket, isOpen, customers]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setTicketData(prev => {
        const newState = { ...prev, [name]: value };
        
        // Logica per select dipendenti
        if (name === 'deviceCategory') {
            const newBrands = deviceData[value] ? Object.keys(deviceData[value]) : [];
            setBrands(newBrands);
            newState.deviceBrand = '';
            newState.deviceModel = '';
            setModels([]);
        } else if (name === 'deviceBrand') {
            const newModels = deviceData[newState.deviceCategory]?.[value] || [];
            setModels(newModels);
            newState.deviceModel = '';
        }
        
        return newState;
    });
  };
  
  const findOrCreateCustomer = async () => {
    const { customerName, customerPhone, customerEmail } = ticketData;
    const customersCollection = collection(dbUserRef, 'customers');
    
    let existingCustomerQuery;
    if (customerPhone) {
        existingCustomerQuery = query(customersCollection, where("phone", "==", customerPhone), limit(1));
    } else if (customerEmail) {
        existingCustomerQuery = query(customersCollection, where("email", "==", customerEmail), limit(1));
    }
    
    if (existingCustomerQuery) {
        const querySnapshot = await getDocs(existingCustomerQuery);
        if (!querySnapshot.empty) {
            const customerDoc = querySnapshot.docs[0];
            showNotify(`Cliente trovato: ${customerDoc.data().name}`);
            return customerDoc.id; // Ritorna ID cliente esistente
        }
    }
    
    if (customers.length >= (settings.customerLimit || 100)) {
        showNotify("Limite clienti raggiunto! Impossibile creare nuovo cliente.");
        return null;
    }
    
    try {
        let teamId;
        if (appUser.role === 'Owner') teamId = appUser.id;
        else if (appUser.role === 'Admin') teamId = appUser.id;
        else teamId = appUser.createdBy; // Tecnico
        
        const newCustomerData = {
            name: customerName,
            phone: customerPhone,
            email: customerEmail,
            notes: "Creato automaticamente da Riparazione",
            teamId: teamId
        };
        const docRef = await addDoc(customersCollection, newCustomerData);
        showNotify("Nuovo cliente registrato!");
        return docRef.id; // Ritorna ID nuovo cliente
    } catch (e) {
        console.error("Errore creazione cliente:", e);
        showNotify("Errore registrazione cliente.");
        return null;
    }
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ticketData.customerName) {
      alert("Inserisci almeno il nome del cliente.");
      return;
    }
    
    let customerId = linkedCustomerId;
    
    if (!editingTicket || !customerId) {
        customerId = await findOrCreateCustomer();
        if (!customerId) {
            return;
        }
    }
    
    // Dati da salvare
    const ticketToSave = { 
      customerId: customerId,
      customerName: ticketData.customerName, // Denormalizza il nome per velocità
      
      deviceCategory: ticketData.deviceCategory,
      deviceBrand: ticketData.deviceBrand,
      deviceModel: ticketData.deviceModel,
      
      deviceCodeType: ticketData.deviceCodeType,
      deviceCodeValue: ticketData.deviceCodeValue,
      
      // Nuovi campi
      imei: ticketData.imei,
      accessories: ticketData.accessories,
      aestheticCondition: ticketData.aestheticCondition,
      cloudUser: ticketData.cloudUser,
      cloudPass: ticketData.cloudPass,
      
      issueType: ticketData.issueType,
      issueDescription: ticketData.issueDescription,
      
      price: parseFloat(ticketData.price) || 0,
      acconto: parseFloat(ticketData.acconto) || 0,
      status: ticketData.status,
      technician: ticketData.technician,
      
      createdBy: editingTicket ? editingTicket.createdBy : appUser.id,
      teamId: editingTicket ? editingTicket.teamId : (appUser.role === 'Admin' ? appUser.id : appUser.createdBy),
    };
    
    onSave(ticketToSave, editingTicket ? editingTicket.id : null);
  };
  

  return (
      <Modal isOpen={isOpen} onClose={onClose} title={editingTicket ? 'Modifica Riparazione' : 'Nuova Riparazione'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          
          <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-medium text-indigo-700 px-2">Dati Cliente</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="customerName" value={ticketData.customerName} onChange={handleChange} placeholder="Nome e Cognome" className="w-full p-2 border rounded-lg" required />
                <input name="customerPhone" value={ticketData.customerPhone} onChange={handleChange} placeholder="Telefono (per ricerca/creazione)" className="w-full p-2 border rounded-lg" />
                <input name="customerEmail" value={ticketData.customerEmail} onChange={handleChange} placeholder="Email (opzionale)" className="w-full p-2 border rounded-lg" />
            </div>
            <p className="text-xs text-gray-500 mt-2">Se inserisci un telefono o email esistente, il cliente verrà collegato. Altrimenti, verrà creato un nuovo cliente.</p>
          </fieldset>

          <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-medium text-indigo-700 px-2">Dati Dispositivo</legend>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <select name="deviceCategory" value={ticketData.deviceCategory} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white" required>
                    <option value="">Seleziona Categoria...</option>
                    {Object.keys(deviceData).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <select name="deviceBrand" value={ticketData.deviceBrand} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white" disabled={brands.length === 0}>
                    <option value="">Seleziona Marca...</option>
                    {brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                </select>
                <select name="deviceModel" value={ticketData.deviceModel} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white" disabled={models.length === 0}>
                    <option value="">Seleziona Modello...</option>
                    {models.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <input name="imei" value={ticketData.imei} onChange={handleChange} placeholder="IMEI / Seriale (opz.)" className="w-full p-2 border rounded-lg" />
                <input name="accessories" value={ticketData.accessories} onChange={handleChange} placeholder="Accessori (es. scatola)" className="w-full p-2 border rounded-lg" />
                <input name="aestheticCondition" value={ticketData.aestheticCondition} onChange={handleChange} placeholder="Condizione Estetica" className="w-full p-2 border rounded-lg" />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <select name="deviceCodeType" value={ticketData.deviceCodeType} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white">
                    <option value="Nessuno">Tipo Sblocco: Nessuno</option>
                    <option value="PIN">PIN</option>
                    <option value="Password">Password</option>
                    <option value="Pattern/Segno">Pattern/Segno</option>
                </select>
                
                {ticketData.deviceCodeType !== 'Nessuno' && (
                    <input 
                        name="deviceCodeValue" 
                        value={ticketData.deviceCodeValue} 
                        onChange={handleChange} 
                        placeholder={`Inserisci ${ticketData.deviceCodeType}...`}
                        className="w-full p-2 border rounded-lg" 
                        required 
                    />
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input name="cloudUser" value={ticketData.cloudUser} onChange={handleChange} placeholder="Cloud User (es. iCloud)" className="w-full p-2 border rounded-lg" />
                <input name="cloudPass" value={ticketData.cloudPass} onChange={handleChange} placeholder="Cloud Password" className="w-full p-2 border rounded-lg" />
            </div>

          </fieldset>
          
          <fieldset className="border p-4 rounded-lg">
            <legend className="text-lg font-medium text-indigo-700 px-2">Dati Problema & Finanze</legend>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <select name="issueType" value={ticketData.issueType} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white" required>
                    <option value="">Seleziona Problema...</option>
                    {issueOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                
                {ticketData.issueType === 'Altro...' && (
                    <input 
                        name="issueDescription" 
                        value={ticketData.issueDescription} 
                        onChange={handleChange} 
                        placeholder="Descrivi il problema" 
                        className="w-full p-2 border rounded-lg" 
                        required 
                    />
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input name="price" type="number" value={ticketData.price} onChange={handleChange} placeholder="Preventivo (€)" className="p-2 border rounded-lg" min="0" step="0.01" required />
                <input name="acconto" type="number" value={ticketData.acconto} onChange={handleChange} placeholder="Acconto Ricevuto (€)" className="p-2 border rounded-lg" min="0" step="0.01" />
                <select name="technician" value={ticketData.technician} onChange={handleChange} className="p-2 border rounded-lg bg-white">
                <option value="">Assegna a...</option>
                {technicians.map(tech => (
                    <option key={tech.id} value={tech.username}>{tech.username}</option>
                ))}
                </select>
            </div>
            
            {editingTicket && (
                <select name="status" value={ticketData.status} onChange={handleChange} className="w-full p-2 border rounded-lg bg-white mt-4">
                <option value="In Coda">In Coda</option>
                <option value="In Lavorazione">In Lavorazione</option>
                <option value="Pronto per il Ritiro">Pronto per il Ritiro</option>
                <option value="Consegnato">Consegnato</option>
                </select>
            )}
          </fieldset>
          
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Annulla</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">Salva</button>
          </div>
        </form>
      </Modal>
  );
};

// Modal per la Stampa
const PrintModal = ({ isOpen, onClose, ticket, customer }) => {
  const printRef = useRef();

  const handlePrint = () => {
    const printContent = printRef.current.innerHTML;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<html><head><title>Stampa Buono</title>');
    doc.write('<style>');
    doc.write(`
      @media print {
        body { font-family: sans-serif; margin: 0; padding: 0; }
        .printable-content { padding: 20px; }
        h2 { text-align: center; font-size: 1.5rem; margin-bottom: 1.5rem; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .mb-4 { margin-bottom: 16px; }
        .pb-4 { padding-bottom: 16px; }
        .border-b { border-bottom: 1px solid #ccc; }
        .font-semibold { font-weight: 600; }
        .font-mono { font-family: monospace; }
        .text-sm { font-size: 0.875rem; }
        .mt-6 { margin-top: 24px; }
        .pt-4 { padding-top: 16px; }
        .border-t { border-top: 1px solid #ccc; }
        .text-lg { font-size: 1.125rem; }
        .font-bold { font-weight: 700; }
        .mt-8 { margin-top: 32px; }
        .text-center { text-align: center; }
        .text-xs { font-size: 0.75rem; }
        .mt-2 { margin-top: 8px; }
        .signature { font-size: 6px; color: #D1D5DB; padding-top: 1rem; text-align: center; }
      }
    `);
    doc.write('</style></head><body>');
    doc.write(printContent);
    doc.write('</body></html>');
    doc.close();
    
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    };
    
    iframe.contentWindow.onafterprint = () => {
        if(document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
    };
    setTimeout(() => {
        if(document.body.contains(iframe)) {
            document.body.removeChild(iframe);
        }
    }, 1500); 
  };

  if (!isOpen || !ticket) return null;
  
  const customerPhone = customer?.phone || 'N/D';
  const customerEmail = customer?.email || 'N/D';
  
  const device = `${ticket.deviceCategory || ''} ${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim();
  const issue = ticket.issueType === 'Altro...' ? ticket.issueDescription : ticket.issueType;
  const deviceCode = (ticket.deviceCodeType && ticket.deviceCodeType !== 'Nessuno' && ticket.deviceCodeValue) 
    ? `${ticket.deviceCodeType}: ${ticket.deviceCodeValue}` 
    : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Stampa Buono di Ritiro">
      {/* Contenuto stampabile */}
      <div ref={printRef} className="printable-content p-4 text-black">
        <h2 className="text-2xl font-bold text-center mb-6">FixManager - Buono di Ritiro</h2>
        
        <div className="grid grid-cols-2 gap-4 mb-4 border-b pb-4">
          <div>
            <p className="font-semibold">Cliente:</p>
            <p>{ticket.customerName}</p>
          </div>
          <div>
            <p className="font-semibold">Contatto:</p>
            <p>{customerPhone} {customerPhone !== 'N/D' && customerEmail !== 'N/D' ? '/' : ''} {customerEmail !== 'N/D' ? customerEmail : ''}</p>
          </div>
        </div>
        
        <div className="mb-4">
          <p className="font-semibold">ID Riparazione:</p>
          <p className="font-mono text-sm">{ticket.id}</p>
        </div>
        <div className="mb-4">
          <p className="font-semibold">Dispositivo:</p>
          <p>{device || 'N/D'}</p>
        </div>
         {/* *** CAMPI AGGIUNTI *** */}
        {ticket.imei && (
          <div className="mb-4">
            <p className="font-semibold">IMEI / Seriale:</p>
            <p>{ticket.imei}</p>
          </div>
        )}
        {deviceCode && (
          <div className="mb-4">
            <p className="font-semibold">Codice Sblocco:</p>
            <p>{deviceCode}</p>
          </div>
        )}
        {ticket.aestheticCondition && (
          <div className="mb-4">
            <p className="font-semibold">Condizione Estetica:</p>
            <p>{ticket.aestheticCondition}</p>
          </div>
        )}
        {ticket.accessories && (
          <div className="mb-4">
            <p className="font-semibold">Accessori Lasciati:</p>
            <p>{ticket.accessories}</p>
          </div>
        )}
        {/* *** FINE CAMPI AGGIUNTI *** */}
        
        <div className="mb-4">
          <p className="font-semibold">Problema Segnalato:</p>
          <p>{issue || 'N/D'}</p>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-6 border-t pt-4">
          <div>
            <p className="font-semibold">Preventivo:</p>
            <p className="text-lg font-bold">€ {(ticket.price || 0).toFixed(2)}</p>
          </div>
           <div>
            <p className="font-semibold">Acconto:</p>
            <p className="text-lg font-bold">€ {(ticket.acconto || 0).toFixed(2)}</p>
          </div>
          <div>
            <p className="font-semibold">Data Accettazione:</p>
            <p>{ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString() : 'N/D'}</p>
          </div>
          <div>
            <p className="font-semibold">Registrato da:</p>
            <p>{ticket.createdByUsername || 'Sistema'}</p>
          </div>
        </div>
        <div className="mt-8 text-center text-xs">
          <p>Grazie per averci scelto. Conservare questo buono per il ritiro.</p>
          <p className="font-bold mt-2">FixManager</p>
        </div>
        {/* FIRMA DEVELOPER */}
        <div className="signature" style={{ fontSize: '6px', color: '#D1D5DB', paddingTop: '1rem', textAlign: 'center' }}>
          MAJAABOU
        </div>
      </div>
      {/* Fine contenuto stampabile */}

      <div className="flex justify-end space-x-3 mt-6 p-4 border-t">
        <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Chiudi</button>
        <button onClick={handlePrint} className="flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">
          {ICONS.Print}
          <span className="ml-2">Stampa</span>
        </button>
      </div>
    </Modal>
  );
};

// *** NUOVO *** Modal Scontrino/POS
const PosModal = ({ isOpen, onClose, ticket, customer }) => {
  const printRef = useRef();

  const handlePrint = () => {
    // Logica di stampa identica a PrintModal
    const printContent = printRef.current.innerHTML;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write('<html><head><title>Stampa Scontrino</title>');
    // Stili simili, ma più da scontrino
    doc.write('<style>');
    doc.write(`
      @media print {
        body { font-family: monospace; margin: 0; padding: 0; width: 80mm; }
        .printable-content { padding: 5mm; }
        h2 { text-align: center; font-size: 1.2rem; margin-bottom: 1rem; }
        div { margin-bottom: 0.5rem; }
        .font-semibold { font-weight: 600; }
        .font-mono { font-family: monospace; }
        .text-lg { font-size: 1.1rem; }
        .font-bold { font-weight: 700; }
        .text-2xl { font-size: 1.5rem; }
        .text-center { text-align: center; }
        .text-xs { font-size: 0.75rem; }
        .mt-4 { margin-top: 1rem; }
        .mt-2 { margin-top: 0.5rem; }
        .border-t { border-top: 1px dashed #000; }
        .flex-between { display: flex; justify-content: space-between; }
        .signature { font-size: 6px; color: #999; padding-top: 1rem; text-align: center; }
      }
    `);
    doc.write('</style></head><body>');
    doc.write(printContent);
    doc.write('</body></html>');
    doc.close();
    
    iframe.onload = () => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    };
    
    iframe.contentWindow.onafterprint = () => {
        if(document.body.contains(iframe)) { document.body.removeChild(iframe); }
    };
    setTimeout(() => {
        if(document.body.contains(iframe)) { document.body.removeChild(iframe); }
    }, 1500); 
  };

  if (!isOpen || !ticket) return null;

  const device = `${ticket.deviceCategory || ''} ${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim();
  const issue = ticket.issueType === 'Altro...' ? ticket.issueDescription : ticket.issueType;
  const preventivo = ticket.price || 0;
  const acconto = ticket.acconto || 0;
  const daPagare = preventivo - acconto;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="POS - Emissione Scontrino" size="md">
      {/* Contenuto stampabile */}
      <div ref={printRef} className="printable-content p-4 text-black">
        <h2 className="text-xl font-bold text-center mb-4">FixManager - Ricevuta</h2>
        <div className="text-center text-xs mb-4">
            <p>FixManager di MAJAABOU</p>
            <p>Via Roma 1, 12345 Città</p>
            <p>P.IVA 1234567890</p>
        </div>
        
        <div className="border-t border-dashed border-black pt-2 mb-2">
            <p className="text-xs">Data: {new Date().toLocaleString()}</p>
            <p className="text-xs">Cliente: {ticket.customerName}</p>
            <p className="text-xs">ID Scheda: {ticket.id.substring(0, 10)}</p>
        </div>
        
        <div className="border-t border-dashed border-black pt-2 mb-2">
            <div className="flex-between">
                <span className="text-sm">Riparazione: {device}</span>
                <span className="text-sm">€{preventivo.toFixed(2)}</span>
            </div>
             <p className="text-xs text-gray-600 pl-2">({issue})</p>
        </div>

        <div className="border-t border-dashed border-black pt-2 mt-4">
            <div className="flex-between text-sm">
                <span>Preventivo Totale</span>
                <span>€{preventivo.toFixed(2)}</span>
            </div>
            <div className="flex-between text-sm">
                <span>Acconto Versato</span>
                <span>- €{acconto.toFixed(2)}</span>
            </div>
            <div className="flex-between text-lg font-bold mt-2 border-t border-black pt-2">
                <span>SALDO DA PAGARE</span>
                <span>€{daPagare.toFixed(2)}</span>
            </div>
        </div>
        
        <div className="mt-8 text-center text-xs">
          <p>Grazie per averci scelto!</p>
          <p className="font-bold mt-2">FixManager</p>
        </div>
        {/* FIRMA DEVELOPER */}
        <div className="signature" style={{ fontSize: '6px', color: '#D1D5DB', paddingTop: '1rem', textAlign: 'center' }}>
          MAJAABOU
        </div>
      </div>
      {/* Fine contenuto stampabile */}

      <div className="p-6 bg-gray-50 rounded-b-lg">
        <div className="flex justify-between items-center mb-4">
            <span className="text-lg font-medium text-gray-600">Saldo da Pagare:</span>
            <span className="text-3xl font-bold text-gray-900">€{daPagare.toFixed(2)}</span>
        </div>
        <div className="flex justify-end space-x-3 mt-6">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Chiudi</button>
            <button onClick={handlePrint} className="flex items-center px-6 py-3 rounded-lg bg-green-600 text-white hover:bg-green-700 font-bold text-sm">
            {ICONS.Print}
            <span className="ml-2">Stampa Scontrino</span>
            </button>
        </div>
      </div>
    </Modal>
  );
};

// Modal Condivisione Stato
const ShareModal = ({ isOpen, onClose, ticket, customer, showNotify }) => {
  if (!isOpen || !ticket) return null;

  const getStatusMessage = (status) => {
    switch (status) {
      case 'In Coda': return "è stato preso in carico.";
      case 'In Lavorazione': return "è attualmente in lavorazione.";
      case 'Pronto per il Ritiro': return "è pronto per il ritiro!";
      case 'Consegnato': return "è stato consegnato.";
      default: return "ha uno stato sconosciuto.";
    }
  };
  
  const device = `${ticket.deviceCategory || ''} ${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim();
  const statusMsg = getStatusMessage(ticket.status);
  const fullMessage = `Gentile ${ticket.customerName}, il suo dispositivo (${device}) ${statusMsg} (ID: ${ticket.id}). Saluti, FixManager.`;
  
  const phone = (customer?.phone || '').replace(/[^0-9+]/g, '');
  const email = customer?.email || '';

  const copyToClipboard = () => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = fullMessage;
      textArea.style.position = "fixed";  
      textArea.style.opacity = 0;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showNotify("Messaggio copiato!");
    } catch (err) {
      console.error('Errore nel copiare:', err);
      showNotify("Errore nel copiare.");
    }
  };


  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Condividi Stato Riparazione">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-600 mb-1">Messaggio per il Cliente:</label>
          <textarea
            readOnly
            value={fullMessage}
            className="w-full h-32 p-2 border rounded-lg bg-gray-50 text-gray-700"
          />
        </div>
        
        <button
          onClick={copyToClipboard}
          className="w-full flex items-center justify-center px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-800 transition-colors text-sm font-medium"
        >
          {ICONS.Copy} <span className="ml-2">Copia Messaggio</span>
        </button>
        
        {phone && (
          <a
            href={`https://wa.me/${phone}?text=${encodeURIComponent(fullMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors text-sm font-medium"
          >
            {ICONS.Send} <span className="ml-2">Invia via WhatsApp</span>
          </a>
        )}
        
        {email && (
          <a
            href={`mailto:${email}?subject=${encodeURIComponent(`Stato Riparazione: ${device}`)}&body=${encodeURIComponent(fullMessage)}`}
            className="w-full flex items-center justify-center px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors text-sm font-medium"
          >
            {ICONS.Email} <span className="ml-2">Invia via Email</span>
          </a>
        )}
        
        {!phone && !email && (
          <p className="text-sm text-center text-red-500">Nessun numero di telefono o email trovato per questo cliente.</p>
        )}
      </div>
    </Modal>
  );
};

// Componente Vista Riparazioni (Tabella)
const RepairView = ({ onNavigate, dbUserRef, appUser, managedUsers, customers, settings, showNotify }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState(null);
  const [ticketToDelete, setTicketToDelete] = useState(null);
  
  const { tickets, loading } = useTickets(dbUserRef, appUser, managedUsers);
  const { technicians } = useUsers(dbUserRef, appUser); // Serve per la dropdown

  const ticketsCollection = collection(dbUserRef, 'tickets');
  const financeCollection = collection(dbUserRef, 'finance');

  const handleSaveTicket = async (ticketData, ticketId) => {
    try {
      if (ticketId) {
        // Modifica
        const editingTicket = tickets.find(t => t.id === ticketId); // Prendi lo stato vecchio
        const ticketRef = doc(ticketsCollection, ticketId);
        
        if (ticketData.status === 'Consegnato' && editingTicket.status !== 'Consegnato') {
          await addDoc(financeCollection, {
            type: 'Entrata',
            description: `Riparazione ${ticketData.deviceCategory} ${ticketData.deviceModel}`,
            amount: ticketData.price,
            date: new Date().toISOString(),
            createdBy: appUser.id,
            teamId: appUser.role === 'Admin' ? appUser.id : appUser.createdBy
          });
          showNotify(`💰 Incasso di €${ticketData.price} registrato!`);
          // NON aprire il POS da qui, solo dalla vista dettaglio
        }
        
        await updateDoc(ticketRef, ticketData);
        setEditingTicket(null);
      } else {
        // Nuovo
        const newTicket = { 
          ...ticketData, 
          createdAt: new Date(), 
          createdByUsername: appUser.username 
        };
        const docRef = await addDoc(ticketsCollection, newTicket);
        onNavigate('RepairDetail', docRef.id);
      }
      setIsModalOpen(false);
    } catch (e) {
      console.error("Errore salvataggio ticket:", e);
      showNotify("Errore nel salvataggio.");
    }
  };

  const handleDeleteTicket = async () => {
    if (ticketToDelete) {
      try {
        await deleteDoc(doc(ticketsCollection, ticketToDelete.id));
        setTicketToDelete(null);
        setIsConfirmOpen(false);
        showNotify("Scheda eliminata.");
      } catch (e) {
        console.error("Errore eliminazione ticket:", e);
        showNotify("Errore nell'eliminazione.");
      }
    }
  };

  const openEditModal = (e, ticket) => {
    e.stopPropagation(); // Evita di triggerare l'onClick della riga
    setEditingTicket(ticket);
    setIsModalOpen(true);
  };

  const openDeleteConfirm = (e, ticket) => {
    e.stopPropagation();
    setTicketToDelete(ticket);
    setIsConfirmOpen(true);
  };
  
  const getStatusChip = (status) => {
    switch (status) {
      case 'In Coda': return <span className="flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-700">{ICONS.Queue}<span className="ml-1">In Coda</span></span>;
      case 'In Lavorazione': return <span className="flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-200 text-yellow-800">{ICONS.Working}<span className="ml-1">In Lavorazione</span></span>;
      case 'Pronto per il Ritiro': return <span className="flex items-center px-2 py-1 text-xs font-medium rounded-full bg-blue-200 text-blue-800">{ICONS.Ready}<span className="ml-1">Pronto</span></span>;
      case 'Consegnato': return <span className="flex items-center px-2 py-1 text-xs font-medium rounded-full bg-purple-200 text-purple-800">{ICONS.Delivered}<span className="ml-1">Consegnato</span></span>;
      default: return <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Schede Riparazione</h2>
        <button
          onClick={() => { setEditingTicket(null); setIsModalOpen(true); }}
          className="flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          {ICONS.Add}
          <span className="ml-2">Nuova Riparazione</span>
        </button>
      </div>

      {loading ? (
        <p>Caricamento...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Dispositivo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Stato</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tecnico</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Prezzo</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickets.map(ticket => {
                const customer = customers.find(c => c.id === ticket.customerId);
                const device = `${ticket.deviceCategory || ''} ${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim();
                const issue = ticket.issueType === 'Altro...' ? ticket.issueDescription : ticket.issueType;
                
                return (
                  <tr 
                    key={ticket.id} 
                    onClick={() => onNavigate('RepairDetail', ticket.id)} 
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{ticket.customerName}</div>
                      <div className="text-sm text-gray-500">{customer?.phone || ''}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{device || 'N/D'}</div>
                      <div className="text-sm text-gray-500 truncate max-w-xs">{issue || 'N/D'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusChip(ticket.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{ticket.technician || 'Non assegnato'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">€ {(ticket.price || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button 
                          onClick={(e) => openEditModal(e, ticket)} 
                          title="Modifica Rapida"
                          className="p-2 rounded-full text-blue-500 hover:bg-blue-100"
                        >
                          {ICONS.Edit}
                        </button>
                        <button 
                          onClick={(e) => openDeleteConfirm(e, ticket)} 
                          title="Elimina"
                          className="p-2 rounded-full text-red-500 hover:bg-red-100"
                        >
                           {ICONS.Delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <TicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTicket}
        technicians={technicians}
        editingTicket={editingTicket}
        appUser={appUser}
        customers={customers}
        settings={settings}
        showNotify={showNotify}
        dbUserRef={dbUserRef}
      />
      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteTicket}
        title="Conferma Eliminazione"
        message={`Sei sicuro di voler eliminare la scheda di ${ticketToDelete?.customerName}? L'azione è irreversibile.`}
      />
    </div>
  );
};

// *** NUOVO *** Hook per Dettaglio Ticket Singolo
const useTicketDetail = (dbUserRef, ticketId, customers) => {
    const [ticket, setTicket] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!dbUserRef || !ticketId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const ticketRef = doc(dbUserRef, 'tickets', ticketId);
        
        const unsubscribe = onSnapshot(ticketRef, (docSnap) => {
            if (docSnap.exists()) {
                const ticketData = { id: docSnap.id, ...docSnap.data() };
                setTicket(ticketData);
                
                // Trova il cliente corrispondente dai clienti già caricati
                if (ticketData.customerId && customers.length > 0) {
                    const foundCustomer = customers.find(c => c.id === ticketData.customerId);
                    setCustomer(foundCustomer || null);
                }
            } else {
                setTicket(null);
                setCustomer(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Errore snapshot dettaglio ticket:", error);
            setLoading(false);
        });

        return () => unsubscribe();

    }, [dbUserRef, ticketId, customers]); // Ricarica se i clienti cambiano

    return { ticket, customer, loading };
};


// *** NUOVO *** VISTA DETTAGLIO RIPARAZIONE
const RepairDetailView = ({ ticketId, onNavigate, dbUserRef, appUser, customers, technicians, showNotify, settings }) => {
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isPosModalOpen, setIsPosModalOpen] = useState(false); // *** NUOVO ***
    
    // Carica il ticket singolo e il suo cliente
    const { ticket, customer, loading } = useTicketDetail(dbUserRef, ticketId, customers);
    
    // Funzioni di salvataggio (riutilizzate da RepairView)
    const ticketsCollection = collection(dbUserRef, 'tickets');
    const financeCollection = collection(dbUserRef, 'finance');
    
    const handleSaveTicket = async (ticketData, tId) => {
        const id = tId || ticketId;
        const oldStatus = ticket?.status;
        
        try {
            const ticketRef = doc(ticketsCollection, id);
            
            // Logica Pagamento
            if (ticketData.status === 'Consegnato' && oldStatus !== 'Consegnato') {
              await addDoc(financeCollection, {
                type: 'Entrata',
                description: `Riparazione ${ticketData.deviceCategory || ''} ${ticketData.deviceModel || ''}`,
                amount: ticketData.price,
                date: new Date().toISOString(),
                createdBy: appUser.id,
                teamId: appUser.role === 'Admin' ? appUser.id : appUser.createdBy
              });
              showNotify(`💰 Incasso di €${ticketData.price} registrato!`);
              
              // *** NUOVO *** Apri POS
              setIsPosModalOpen(true);
            }
            
            await updateDoc(ticketRef, ticketData);
            showNotify("Riparazione aggiornata!");
            setIsModalOpen(false); // Chiudi il modal di modifica
        } catch (e) {
            console.error("Errore salvataggio ticket:", e);
            showNotify("Errore nel salvataggio.");
        }
    };
    
    // Funzione rapida per cambiare stato
    const handleChangeStatus = (newStatus) => {
        const updatedTicket = { ...ticket, status: newStatus };
        handleSaveTicket(updatedTicket, ticket.id);
    };

    if (loading) return <p className="p-6">Caricamento scheda...</p>;
    if (!ticket) return <p className="p-6">Scheda non trovata. <button onClick={() => onNavigate('Riparazioni')} className="text-blue-500 underline">Torna alla lista</button></p>;
    
    // Dati formattati
    const device = `${ticket.deviceCategory || ''} ${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim();
    const issue = ticket.issueType === 'Altro...' ? ticket.issueDescription : ticket.issueType;
    const deviceCode = (ticket.deviceCodeType && ticket.deviceCodeType !== 'Nessuno' && ticket.deviceCodeValue) 
        ? `${ticket.deviceCodeType}: ${ticket.deviceCodeValue}` 
        : null;
    const arrivo = ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000) : null;
    
    // Calcola da quanto tempo è in laboratorio
    const timeInLab = arrivo ? Math.floor((new Date() - arrivo) / (1000 * 60 * 60 * 24)) : 0;
    
    const getStatusButton = () => {
        switch (ticket.status) {
            case 'In Coda': 
                return <button onClick={() => handleChangeStatus('In Lavorazione')} className="w-full py-3 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600">Sposta in Lavorazione</button>;
            case 'In Lavorazione': 
                return <button onClick={() => handleChangeStatus('Pronto per il Ritiro')} className="w-full py-3 bg-blue-500 text-white font-bold rounded-lg hover:bg-blue-600">Sposta in Pronto per Ritiro</button>;
            case 'Pronto per il Ritiro': 
                return <button onClick={() => handleChangeStatus('Consegnato')} className="w-full py-3 bg-purple-500 text-white font-bold rounded-lg hover:bg-purple-600">Segna come Consegnato</button>;
            case 'Consegnato':
                return <p className="text-center font-semibold text-purple-700">Riparazione Completata</p>;
            default: return null;
        }
    };
    
    const DetailRow = ({ label, value, defaultVal = 'N/D' }) => (
        value ? (
            <div className="text-sm">
                <span className="font-semibold text-gray-500">{label}: </span>
                <span className="text-gray-800">{value}</span>
            </div>
        ) : (
             <div className="text-sm">
                <span className="font-semibold text-gray-500">{label}: </span>
                <span className="text-gray-400">{defaultVal}</span>
            </div>
        )
    );

    return (
        <div className="p-6">
            {/* Header Pagina */}
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => onNavigate('Riparazioni')} className="flex items-center text-indigo-600 hover:text-indigo-800 font-medium">
                    {ICONS.Back}
                    <span className="ml-2">Torna alle Riparazioni</span>
                </button>
                <div className="flex space-x-2">
                    <button onClick={() => setIsPrintModalOpen(true)} className="flex items-center px-3 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">
                        {ICONS.Print} <span className="hidden sm:inline ml-2">Stampa</span>
                    </button>
                    <button onClick={() => setIsShareModalOpen(true)} className="flex items-center px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-sm font-medium">
                        {ICONS.Share} <span className="hidden sm:inline ml-2">Condividi</span>
                    </button>
                    <button onClick={() => setIsModalOpen(true)} className="flex items-center px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">
                        {ICONS.Edit} <span className="hidden sm:inline ml-2">Modifica</span>
                    </button>
                </div>
            </div>

            {/* Dettaglio Principale */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
                <div className="flex flex-col md:flex-row justify-between">
                    {/* Colonna Sinistra: Info Dispositivo */}
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900">{device}</h2>
                        <p className="text-lg font-medium text-red-600">{issue}</p>
                        
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
                            <DetailRow label="ID Scheda" value={ticket.id.substring(0, 10) + '...'} />
                            {deviceCode && <DetailRow label="Sblocco" value={deviceCode} />}
                            <DetailRow label="IMEI/Seriale" value={ticket.imei} />
                            <DetailRow label="Condizione" value={ticket.aestheticCondition} />
                            <DetailRow label="Accessori" value={ticket.accessories} />
                            <DetailRow label="Tecnico" value={ticket.technician} defaultVal="Non assegnato" />
                            <DetailRow label="Cloud User" value={ticket.cloudUser} />
                            <DetailRow label="Cloud Pass" value={ticket.cloudPass} />
                        </div>
                    </div>
                    
                    {/* Colonna Destra: Info Cliente */}
                    <div className="md:text-right mt-6 md:mt-0 border-t md:border-t-0 md:border-l md:pl-6 pt-6 md:pt-0">
                        <h3 className="text-lg font-semibold text-gray-900">{customer?.name || ticket.customerName}</h3>
                        {customer?.phone && (
                            <a href={`tel:${customer.phone}`} className="flex items-center justify-end text-gray-600 hover:text-indigo-600">
                                <span className="mr-2">{customer.phone}</span>
                                {ICONS.Send} {/* Sostituito con icona */}
                            </a>
                        )}
                        {customer?.email && (
                            <a href={`mailto:${customer.email}`} className="flex items-center justify-end text-gray-600 hover:text-indigo-600">
                                <span className="mr-2">{customer.email}</span>
                                {ICONS.Email}
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {/* Card Stato e Finanze */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <StatCard title="Status" value={ticket.status} icon={ICONS.Queue} color="gray" />
                <StatCard title="Preventivo" value={`€ ${(ticket.price || 0).toFixed(2)}`} icon={ICONS.Finance} color="blue" />
                <StatCard title="Acconto" value={`€ ${(ticket.acconto || 0).toFixed(2)}`} icon={ICONS.Acconto} color="green" />
                <StatCard title="Arrivo" value={arrivo ? `${arrivo.toLocaleDateString()} (${timeInLab} gg fa)` : 'N/D'} icon={ICONS.Clock} color="yellow" />
            </div>
            
            {/* Azioni e Note */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-base font-semibold text-gray-700 mb-4">Note e Avvisi</h3>
                    <div className="text-center text-gray-400 p-8 border-2 border-dashed rounded-lg">
                        <p>Area per note e notifiche (non ancora implementata)</p>
                    </div>
                </div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                    <h3 className="text-base font-semibold text-gray-700 mb-4">Azioni Rapide</h3>
                    <div className="space-y-4">
                        {getStatusButton()}
                         <button 
                            onClick={() => console.log("Assegna tecnico")} 
                            className="w-full py-2 border border-gray-400 text-gray-700 font-bold rounded-lg hover:bg-gray-100"
                        >
                            Assegna a Tecnico
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Modals */}
            <TicketModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveTicket}
                technicians={technicians}
                editingTicket={ticket} // Passa il ticket corrente per la modifica
                appUser={appUser}
                customers={customers}
                settings={settings}
                showNotify={showNotify}
                dbUserRef={dbUserRef}
            />
            <PrintModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                ticket={ticket}
                customer={customer}
            />
            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                ticket={ticket}
                customer={customer}
                showNotify={showNotify}
            />
            {/* *** NUOVO *** Chiamata al Modal POS */}
            <PosModal
                isOpen={isPosModalOpen}
                onClose={() => setIsPosModalOpen(false)}
                ticket={ticket}
                customer={customer}
            />
        </div>
    );
};


// Menu Dropdown per Azioni
const DropdownMenu = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="p-1 rounded-full text-gray-500 hover:bg-gray-100">
        {ICONS.More}
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl z-10 border">
          {React.Children.map(children, child =>
            React.cloneElement(child, { onClick: () => { child.props.onClick(); setIsOpen(false); } })
          )}
        </div>
      )}
    </div>
  );
};
const DropdownItem = ({ icon, text, onClick }) => (
  <button onClick={onClick} className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
    {icon}
    <span className="ml-2">{text}</span>
  </button>
);


// --- SEZIONE TEAM (TEAMVIEW) ---

const TeamView = ({ dbUserRef, appUser }) => {
  const { users, loading } = useUsers(dbUserRef, appUser);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Tecnico');
  
  const usersCollection = collection(dbUserRef, 'users');

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    
    const q = query(usersCollection, where("username", "==", username));
    const existing = await getDocs(q);
    if (!existing.empty) {
      alert("Questo username esiste già.");
      return;
    }

    try {
      await addDoc(usersCollection, {
        username,
        password, // Mai salvare password in chiaro in produzione!
        role,
        createdBy: appUser.id // Salva chi ha creato questo utente
      });
      setIsModalOpen(false);
      setUsername('');
      setPassword('');
      setRole('Tecnico');
    } catch (error) {
      console.error("Errore aggiunta utente:", error);
    }
  };

  const openDeleteConfirm = (user) => {
    setUserToDelete(user);
    setIsConfirmOpen(true);
  };

  const handleDeleteUser = async () => {
    if (userToDelete) {
      try {
        await deleteDoc(doc(usersCollection, userToDelete.id));
        setUserToDelete(null);
        setIsConfirmOpen(false);
      } catch (error) {
        console.error("Errore eliminazione utente:", error);
      }
    }
  };
  
  const getRoleColor = (role) => {
    switch (role) {
      case 'Owner': return 'bg-red-600';
      case 'Admin': return 'bg-blue-600';
      case 'Tecnico': return 'bg-yellow-600';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Gestione Team</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          {ICONS.AddUser}
          <span className="ml-2">Aggiungi Membro</span>
        </button>
      </div>
      
      {loading ? (
        <p>Caricamento...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ruolo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Creato Da</th>
                <th className="px-6 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Azioni</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-700">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="ml-3 font-medium text-gray-900">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${getRoleColor(user.role)} text-white`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {user.createdBy === appUser.id ? 'Te' : (user.createdBy === 'system' ? 'Sistema' : user.createdBy)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button onClick={() => openDeleteConfirm(user)} className="p-2 rounded-full text-red-500 hover:bg-red-100">
                      {ICONS.Delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Modal Aggiungi Utente */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Aggiungi Membro Team">
        <form onSubmit={handleAddUser} className="space-y-4">
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="w-full p-2 border rounded-lg" required />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="w-full p-2 border rounded-lg" required />
          {appUser.role === 'Owner' && (
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
              <option value="Tecnico">Tecnico</option>
              <option value="Admin">Admin</option>
            </select>
          )}
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Annulla</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-medium">Crea Utente</button>
          </div>
        </form>
      </Modal>
      
      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleDeleteUser}
        title="Conferma Eliminazione"
        message={`Sei sicuro di voler eliminare l'utente ${userToDelete?.username}?`}
      />
    </div>
  );
};


// --- SEZIONE FINANZE (FINANCEVIEW) ---

const useFinance = (dbUserRef, appUser, managedUsers) => {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dbUserRef || !appUser) {
      setLoading(false);
      setMovements([]);
      return;
    }

    setLoading(true);
    const financeCollection = collection(dbUserRef, 'finance');
    
    let q;
    if (appUser.role === 'Owner') {
      q = query(financeCollection);
    } else if (appUser.role === 'Admin') {
      const visibleIds = [appUser.id, ...managedUsers.map(u => u.id)];
      q = query(financeCollection, where("createdBy", "in", visibleIds));
    } else {
      q = query(financeCollection, where("createdBy", "==", "")); // Query vuota
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const financeData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      financeData.sort((a, b) => new Date(b.date) - new Date(a.date));
      setMovements(financeData);
      setLoading(false);
    }, (error) => {
      console.error("Errore snapshot finance:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [dbUserRef, appUser, managedUsers]);

  return { movements, loading };
};

const FinanceView = ({ dbUserRef, appUser, managedUsers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  const { movements, loading } = useFinance(dbUserRef, appUser, managedUsers);
  const financeCollection = collection(dbUserRef, 'finance');

  const handleAddMovement = async (e) => {
    e.preventDefault();
    if (!description || !amount) return;
    
    try {
      await addDoc(financeCollection, {
        type: 'Uscita', // Solo le uscite sono manuali
        description,
        amount: parseFloat(amount),
        date: new Date().toISOString(),
        createdBy: appUser.id,
        teamId: appUser.role === 'Admin' ? appUser.id : appUser.createdBy
      });
      setIsModalOpen(false);
      setDescription('');
      setAmount('');
    } catch (error) {
      console.error("Errore aggiunta movimento:", error);
    }
  };

  const handleExport = (filteredMovements) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Tipo,Descrizione,Importo,Data\r\n";
    
    filteredMovements.forEach(row => {
      csvContent += `${row.type},"${row.description.replace(/"/g, '""')}",${row.amount},${new Date(row.date).toLocaleDateString()}\r\n`;
    });
    
    const entrate = filteredMovements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
    const uscite = filteredMovements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
    const utile = entrate - uscite;

    csvContent += "\r\n";
    csvContent += "Riepilogo Mese\r\n";
    csvContent += `Entrate Totali,${entrate.toFixed(2)}\r\n`;
    csvContent += `Uscite Totali,${uscite.toFixed(2)}\r\n`;
    csvContent += `Utile Netto,${utile.toFixed(2)}\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_cassa_${currentYear}_${currentMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const filteredMovements = movements.filter(m => {
    const date = new Date(m.date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  });
  
  const entrate = filteredMovements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
  const uscite = filteredMovements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
  const utile = entrate - uscite;
  
  const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Cassa & Movimenti</h2>
        <div className="flex space-x-3">
          <button
            onClick={() => handleExport(filteredMovements)}
            className="flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            {ICONS.Print}
            <span className="ml-2">Esporta Report (CSV)</span>
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors text-sm font-medium"
          >
            {ICONS.Add}
            <span className="ml-2">Nuova Uscita</span>
          </button>
        </div>
      </div>
      
      {/* Filtri Data */}
      <div className="flex items-center space-x-4 mb-6 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
        <span className="font-semibold text-gray-700 text-sm">Filtra per Mese:</span>
        <select value={currentMonth} onChange={(e) => setCurrentMonth(parseInt(e.target.value))} className="p-2 border rounded-lg bg-white text-sm">
          {monthNames.map((month, index) => (
            <option key={index} value={index}>{month}</option>
          ))}
        </select>
        <input 
          type="number"
          value={currentYear}
          onChange={(e) => setCurrentYear(parseInt(e.target.value))}
          className="p-2 border rounded-lg w-24 text-sm"
          placeholder="Anno"
        />
      </div>
      
      {/* Riepilogo Mese */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-green-500">
          <p className="text-sm font-medium text-gray-500">Entrate (Mese)</p>
          <p className="text-2xl font-bold text-gray-900">€ {entrate.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-red-500">
          <p className="text-sm font-medium text-gray-500">Uscite (Mese)</p>
          <p className="text-2xl font-bold text-gray-900">€ {uscite.toFixed(2)}</p>
        </div>
        <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 border-blue-500">
          <p className="text-sm font-medium text-gray-500">Utile Netto (Mese)</p>
          <p className="text-2xl font-bold text-gray-900">€ {utile.toFixed(2)}</p>
        </div>
      </div>

      {loading ? (
        <p>Caricamento...</p>
      ) : (
        <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Data</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Descrizione</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Importo</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMovements.map(mov => (
                <tr key={mov.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{new Date(mov.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{mov.description}</td>
                  <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-semibold ${mov.type === 'Entrata' ? 'text-green-600' : 'text-red-600'}`}>
                    {mov.type === 'Entrata' ? '+' : '-'} € {mov.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Aggiungi Uscita */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Aggiungi Uscita Manuale">
        <form onSubmit={handleAddMovement} className="space-y-4">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrizione (es. Affitto, Pezzi ricambio...)" className="w-full p-2 border rounded-lg" required />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Importo (€)" className="w-full p-2 border rounded-lg" min="0.01" step="0.01" required />
          <div className="flex justify-end space-x-3 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium">Annulla</button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium">Aggiungi Uscita</button>
          </div>
        </form>
      </Modal>
    </div>
  );
};


// --- SEZIONE DASHBOARD (DASHBOARDVIEW) ---

// *** NUOVO *** Multi-Select per Admin
const MultiSelectDropdown = ({ options, selected, onChange, placeholder = "Seleziona..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleOption = (id) => {
        if (selected.includes(id)) {
            onChange(selected.filter(item => item !== id));
        } else {
            onChange([...selected, id]);
        }
    };
    
    const selectedNames = options
        .filter(opt => selected.includes(opt.id))
        .map(opt => opt.username)
        .join(', ');

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-2 border rounded-lg bg-white text-left"
            >
                <span className={selected.length > 0 ? "text-gray-800" : "text-gray-400"}>
                    {selected.length > 0 ? selectedNames : placeholder}
                </span>
            </button>
            {isOpen && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {options.map(option => (
                        <div
                            key={option.id}
                            onClick={() => toggleOption(option.id)}
                            className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-100"
                        >
                            <input
                                type="checkbox"
                                checked={selected.includes(option.id)}
                                readOnly
                                className="mr-2"
                            />
                            <span>{option.username} ({option.role})</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


const AnnouncementPanel = ({ appUser, dbUserRef, allAdmins }) => {
    const { announcements, loading, sendAnnouncement } = useAnnouncements(dbUserRef, appUser);
    const [message, setMessage] = useState('');
    const [targetAdmins, setTargetAdmins] = useState([]); // Array di ID
    const [isGlobal, setIsGlobal] = useState(true);

    const handleSend = () => {
        if (message.trim()) {
            const targets = isGlobal ? [] : targetAdmins;
            sendAnnouncement(message, targets);
            setMessage('');
            setTargetAdmins([]);
            setIsGlobal(true);
        }
    };
    
    // Gli admin vedono gli avvisi
    if (appUser.role === 'Admin') {
        return (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
                <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center">
                    {ICONS.Announcement} <span className="ml-2">Avvisi</span>
                </h3>
                {loading && <p>Caricamento avvisi...</p>}
                {!loading && announcements.length === 0 && (
                    <p className="text-sm text-gray-500">Nessun avviso recente.</p>
                )}
                <div className="space-y-3 max-h-48 overflow-y-auto">
                    {announcements.map(ann => {
                        const isTargeted = ann.targetAdmins && ann.targetAdmins.length > 0;
                        return (
                            <div key={ann.id} className={`p-3 border-l-4 rounded ${isTargeted ? 'bg-yellow-50 border-yellow-500' : 'bg-blue-50 border-blue-500'}`}>
                                <p className="text-sm text-gray-800">{ann.message}</p>
                                <p className="text-xs text-gray-500 mt-1">
                                    Da {ann.sentBy} il {new Date(ann.createdAt.seconds * 1000).toLocaleDateString()}
                                    {isTargeted && <span className="font-bold text-yellow-700"> (Solo per te)</span>}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
    
    // L'Owner invia gli avvisi
    if (appUser.role === 'Owner') {
        return (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
                <h3 className="text-base font-semibold text-gray-700 mb-4">Invia Avviso</h3>
                <div className="space-y-3">
                    <textarea 
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Scrivi un messaggio..."
                        className="w-full p-2 border rounded-lg h-24"
                    />
                    <div className="flex space-x-4">
                        <label className="flex items-center text-sm">
                            <input type="radio" name="targetType" checked={isGlobal} onChange={() => setIsGlobal(true)} className="mr-2" />
                            Globale (a tutti)
                        </label>
                         <label className="flex items-center text-sm">
                            <input type="radio" name="targetType" checked={!isGlobal} onChange={() => setIsGlobal(false)} className="mr-2" />
                            Mirato
                        </label>
                    </div>
                    {!isGlobal && (
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-1">Seleziona Admin</label>
                            <MultiSelectDropdown
                                options={allAdmins}
                                selected={targetAdmins}
                                onChange={setTargetAdmins}
                                placeholder="Seleziona admin..."
                            />
                        </div>
                    )}
                    <button
                        onClick={handleSend}
                        className="flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
                    >
                        {ICONS.Send} <span className="ml-2">Invia Avviso</span>
                    </button>
                </div>
            </div>
        );
    }
    
    return null; // I tecnici non vedono nulla
};

// *** NUOVO *** Componente Lista Ticket per Dashboard
const DashboardTicketList = ({ title, tickets, icon, onNavigate }) => {
    return (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 h-full">
            <h3 className="text-base font-semibold text-gray-700 mb-4 flex items-center">
                {icon} <span className="ml-2">{title}</span>
            </h3>
            {tickets.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nessuna riparazione in questo stato.</p>
            ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {tickets.map(ticket => {
                        const device = `${ticket.deviceCategory || ''} ${ticket.deviceBrand || ''} ${ticket.deviceModel || ''}`.trim();
                        const issue = ticket.issueType === 'Altro...' ? ticket.issueDescription : ticket.issueType;
                        return (
                            <div 
                                key={ticket.id} 
                                onClick={() => onNavigate('RepairDetail', ticket.id)}
                                className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-sm text-gray-900">{device || 'Dispositivo N/D'}</span>
                                    <span className="text-xs text-gray-500">{ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString() : ''}</span>
                                </div>
                                <p className="text-sm text-red-600">{issue || 'Problema N/D'}</p>
                                <p className="text-xs text-gray-500 mt-1">{ticket.customerName}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};


// *** MODIFICATA *** DASHBOARDVIEW
const DashboardView = ({ dbUserRef, appUser, managedUsers, onNavigate, allAdmins }) => {
  const { tickets, loading: ticketsLoading } = useTickets(dbUserRef, appUser, managedUsers);
  const { movements, loading: financeLoading } = useFinance(dbUserRef, appUser, managedUsers);

  if (ticketsLoading || financeLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="loader text-gray-700">Caricamento dashboard...</div>
      </div>
    );
  }

  // Calcoli Finanziari Mese Corrente
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  const monthMovements = movements.filter(m => {
    const mDate = new Date(m.date);
    return mDate.getMonth() === currentMonth && mDate.getFullYear() === currentYear;
  });
  const monthEntrate = monthMovements.filter(m => m.type === 'Entrata').reduce((acc, m) => acc + m.amount, 0);
  const monthUscite = monthMovements.filter(m => m.type === 'Uscita').reduce((acc, m) => acc + m.amount, 0);
  
  // Calcoli Riparazioni per liste
  const ticketsInAttesa = tickets.filter(t => t.status === 'In Coda');
  
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Bentornato, {appUser.username}!</h2>
      
      {/* Layout a 2 colonne */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Colonna Sinistra */}
          <div className="col-span-1 space-y-6">
              {/* Box Statistiche Mese */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                 <h3 className="text-base font-semibold text-gray-700 mb-4">Mese in corso</h3>
                 <div className="space-y-2">
                     <div className="flex justify-between items-center">
                         <span className="text-gray-500 text-sm">Entrate</span>
                         <span className="font-semibold text-green-600">€ {monthEntrate.toFixed(2)}</span>
                     </div>
                      <div className="flex justify-between items-center">
                         <span className="text-gray-500 text-sm">Uscite</span>
                         <span className="font-semibold text-red-600">€ {monthUscite.toFixed(2)}</span>
                     </div>
                     <div className="flex justify-between items-center border-t pt-2 mt-2">
                         <span className="text-gray-800 font-bold">Utile</span>
                         <span className="font-bold text-xl text-blue-600">€ {(monthEntrate - monthUscite).toFixed(2)}</span>
                     </div>
                 </div>
              </div>
              
              {/* Box Avvisi */}
              { (appUser.role === 'Owner' || appUser.role === 'Admin') &&
                 <AnnouncementPanel appUser={appUser} dbUserRef={dbUserRef} allAdmins={allAdmins} />
              }
               
           </div>
          
          {/* Colonna Destra */}
          <div className="col-span-1 space-y-6">
               <DashboardTicketList
                title="Riparazioni in attesa"
                tickets={ticketsInAttesa}
                icon={ICONS.Queue}
                onNavigate={onNavigate}
               />
          </div>
      </div>
      
    </div>
  );
};

const StatCard = ({ title, value, icon, color }) => {
  const colors = {
    blue: 'border-blue-500',
    gray: 'border-gray-500',
    yellow: 'border-yellow-500',
    green: 'border-green-500',
  };
  return (
    <div className={`p-4 bg-white rounded-lg shadow-sm border border-gray-200 border-l-4 ${colors[color] || 'border-gray-500'}`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        {React.cloneElement(icon, { size: 24, className: 'text-gray-400' })}
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPALE APP ---

function MainApp({ appUser, logout, dbUserRef }) {
  const [activeView, setActiveView] = useState('Dashboard');
  const [selectedTicketId, setSelectedTicketId] = useState(null); // *** NUOVO ***
  
  const { users: managedUsers, loading: loadingUsers, allAdmins } = useUsers(dbUserRef, appUser);
  const { customers, loading: loadingCustomers } = useCustomers(dbUserRef, appUser);
  const { settings, loading: loadingSettings, saveSettings } = useSettings(dbUserRef);
  
  const [showNotification, setShowNotification] = useState(false);
  const [notificationText, setNotificationText] = useState('');
  const notificationTimer = useRef(null);

  const showNotify = (text) => {
    if (notificationTimer.current) {
      clearTimeout(notificationTimer.current);
    }
    setNotificationText(text);
    setShowNotification(true);
    notificationTimer.current = setTimeout(() => {
      setShowNotification(false);
    }, 3000);
  };
  
  // *** NUOVO *** Funzione di navigazione
  const handleNavigate = (view, id = null) => {
      setSelectedTicketId(id);
      setActiveView(view);
  };
  
  // Attendi che tutti i dati essenziali siano caricati
  if (loadingUsers || loadingCustomers || loadingSettings) {
      return (
         <div className="flex h-screen bg-gray-50">
             <Sidebar 
                appUser={appUser} 
                onLogout={logout} 
                onNavigate={handleNavigate} 
                activeView={activeView} 
             />
             <main className="flex-grow ml-64 overflow-y-auto p-6">
                <div className="loader text-gray-700">Caricamento dati...</div>
             </main>
         </div>
      );
  }
  
  const renderView = () => {
    switch (activeView) {
      case 'Dashboard':
        return <DashboardView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={managedUsers} 
                  onNavigate={handleNavigate} 
                  allAdmins={allAdmins} // Passa la lista admin
                />;
      case 'Riparazioni':
        return <RepairView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={managedUsers} 
                  customers={customers}
                  settings={settings}
                  showNotify={showNotify}
                  onNavigate={handleNavigate} // Passa la navigazione
                />;
      // *** NUOVO *** Vista Dettaglio
      case 'RepairDetail':
        return <RepairDetailView
                  ticketId={selectedTicketId}
                  onNavigate={handleNavigate}
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  customers={customers}
                  technicians={managedUsers.filter(u => u.role === 'Tecnico')} // Passa solo i tecnici
                  showNotify={showNotify}
                  settings={settings}
                />;
      case 'Clienti':
        return <CustomerView
                  dbUserRef={dbUserRef}
                  appUser={appUser}
                  settings={settings}
                  customers={customers}
                  loadingCustomers={loadingCustomers}
                  showNotify={showNotify}
                />;
      case 'Cassa':
        return <FinanceView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={managedUsers} 
                />;
      case 'Team':
        return <TeamView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                />;
      case 'Impostazioni':
        return <SettingsView
                  settings={settings}
                  loadingSettings={loadingSettings}
                  saveSettings={saveSettings}
                  showNotify={showNotify}
                />;
      default:
        return <DashboardView 
                  dbUserRef={dbUserRef} 
                  appUser={appUser} 
                  managedUsers={managedUsers} 
                  onNavigate={handleNavigate} 
                  allAdmins={allAdmins}
                />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        appUser={appUser} 
        onLogout={logout} 
        onNavigate={handleNavigate} 
        activeView={activeView} 
      />
      <main className="flex-grow ml-64 overflow-y-auto">
        {renderView()}
      </main>
      <Notification text={notificationText} show={showNotification} onHide={() => setShowNotification(false)} />
    </div>
  );
}


export default function App() {
  const { authReady, appUser, loading, error, login, logout, dbUserRef } = useAuth(AuthContext);

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
  return <MainApp appUser={appUser} logout={logout} dbUserRef={dbUserRef} />;
}
