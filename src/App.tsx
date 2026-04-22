/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ShoppingCart, 
  X, 
  Plus, 
  Edit2, 
  Trash2, 
  LogOut, 
  User as UserIcon,
  ChevronRight,
  Package,
  Clock,
  Percent,
  Phone,
  Mail,
  Instagram,
  Facebook,
  FileSpreadsheet,
  AlertCircle,
  MessageCircle,
  MessageSquare,
  PlusCircle,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import * as XLSX from 'xlsx';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
import { Product, Category, Quote } from './types';

// --- Constants ---
const INITIAL_CATEGORIES = [
  'Tecnología',
  'Ropa Corporativa',
  'Hogar',
  'Promocionales'
];

// --- APP ---

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'catalog' | 'product' | 'dashboard'>('home');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [loginData, setLoginData] = useState({ user: '', pass: '' });
  
  // Admin Category filter for Dashboard
  const [dashCategory, setDashCategory] = useState('All');
  
  // Bulk upload state
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkLog, setBulkLog] = useState<{ success: number, errors: string[] } | null>(null);
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [quoteForm, setQuoteForm] = useState({ name: '', email: '' });

  useEffect(() => {
    // Listen for products
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
      setProducts(data);
    });

    // Listen for categories
    const unsubscribeCats = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Category[];
      setCategories(data);
    });

    return () => {
      unsubscribe();
      unsubscribeCats();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setQuotes([]);
      return;
    }
    // Listen for quotes
    const unsubscribeQuotes = onSnapshot(query(collection(db, 'quotes'), orderBy('createdAt', 'desc')), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Quote[];
      setQuotes(data);
    }, (error) => {
      console.error("Quotes listener error:", error);
    });

    return () => unsubscribeQuotes();
  }, [isAdmin]);

  // Seed initial categories and products if empty
  useEffect(() => {
    const checkAndSeed = async () => {
      const catSnapshot = await getDocs(collection(db, 'categories'));
      let currentCategories: Category[] = [];
      
      if (catSnapshot.empty) {
        for (const catName of INITIAL_CATEGORIES) {
          const docRef = await addDoc(collection(db, 'categories'), { name: catName });
          currentCategories.push({ id: docRef.id, name: catName });
        }
      } else {
        currentCategories = catSnapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Category[];
        // Remove duplicates if any (cleanup for user)
        const seen = new Set();
        for (const cat of currentCategories) {
          if (seen.has(cat.name)) {
            await deleteDoc(doc(db, 'categories', cat.id!));
          } else {
            seen.add(cat.name);
          }
        }
      }

      const prodSnapshot = await getDocs(collection(db, 'products'));
      if (prodSnapshot.empty) {
        for (const cat of currentCategories) {
          for (let i = 1; i <= 10; i++) {
            await addDoc(collection(db, 'products'), {
              name: `${cat.name} Premium ${i}`,
              description: `Este es el ${cat.name} versión ${i}, diseñado con los mejores estándares para tu empresa.`,
              price: Math.floor(Math.random() * 50000) + 10000,
              stock: Math.floor(Math.random() * 200),
              category: cat.name,
              imageUrl: `https://picsum.photos/seed/${cat.name}${i}/800/1000`,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
        }
      }
    };
    checkAndSeed();
  }, [categories]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginData.user === 'User' && loginData.pass === '1234') {
      setIsAdmin(true);
      setShowLogin(false);
      setLoginData({ user: '', pass: '' });
      setCurrentView('dashboard');
    } else {
      alert('Credenciales incorrectas');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    try {
      if (editingProduct.id) {
        // Update
        const { id, ...data } = editingProduct;
        await updateDoc(doc(db, 'products', id), {
          ...data,
          updatedAt: serverTimestamp()
        });
      } else {
        // Create
        await addDoc(collection(db, 'products'), {
          ...editingProduct,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setEditingProduct(null);
      setCurrentView('dashboard');
    } catch (error) {
      console.error('Error saving product:', error);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
      await deleteDoc(doc(db, 'products', id));
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstream = evt.target?.result;
        const wb = XLSX.read(bstream, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const validProducts: any[] = [];
        const errors: string[] = [];

        data.forEach((row, idx) => {
          const rowNum = idx + 2;
          const name = row['Nombre del Producto'];
          const stock = parseInt(row['Stock']);
          const category = row['Categoría'];
          const availability = row['Disponibilidad'];

          if (!name || isNaN(stock) || !category) {
            errors.push(`Fila ${rowNum}: Faltan campos obligatorios.`);
            return;
          }

          const catExists = categories.some(c => c.name === category);
          const finalCategory = catExists ? category : '(Sin Categoría)';

          validProducts.push({
            name,
            stock,
            category: finalCategory,
            price: 0,
            description: `Disponibilidad: ${availability || 'Inmediata'}`,
            imageUrl: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        });

        if (validProducts.length > 0) {
          const batch = writeBatch(db);
          validProducts.forEach(p => {
            const docRef = doc(collection(db, 'products'));
            batch.set(docRef, p);
          });
          await batch.commit();
        }

        setBulkLog({ success: validProducts.length, errors });
        setShowBulkUpload(false);
      } catch (err) {
        console.error(err);
        alert('Error al procesar el archivo Excel.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          const content = readerEvent.target?.result as string;
          if (editingProduct) {
            setEditingProduct({ ...editingProduct, imageUrl: content });
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      await addDoc(collection(db, 'categories'), { name: newCatName });
      setNewCatName('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (confirm('¿Eliminar esta categoría?')) {
      await deleteDoc(doc(db, 'categories', id));
    }
  };

  const handleQuoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || !quoteForm.name || !quoteForm.email) return;
    try {
      await addDoc(collection(db, 'quotes'), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        clientName: quoteForm.name,
        clientEmail: quoteForm.email,
        createdAt: serverTimestamp()
      });
      alert('Solicitud enviada con éxito. Te contactaremos pronto.');
      setQuoteForm({ name: '', email: '' });
    } catch (err) {
      console.error(err);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#fcfcfc] font-sans text-neutral-900">
      
      {/* --- Global Header / Navbar --- */}
      <header className="bg-white border-b border-[var(--border)] px-6 min-h-[60px] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <div className="logo font-extrabold text-xl font-sans tracking-tight cursor-pointer flex items-center gap-2" onClick={() => setCurrentView('home')}>
            <span className="bg-blue-600 text-white px-2 py-0.5 rounded italic">IHM</span> CHILE
          </div>
          <nav className="flex gap-4">
            <button 
              onClick={() => setCurrentView('home')}
              className={cn(
                "text-sm font-bold uppercase tracking-wider px-2 py-1 transition-all",
                currentView === 'home' ? "text-[var(--primary)] border-b-2 border-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              Inicio
            </button>
            <button 
              onClick={() => setCurrentView('catalog')}
              className={cn(
                "text-sm font-bold uppercase tracking-wider px-2 py-1 transition-all",
                currentView === 'catalog' ? "text-[var(--primary)] border-b-2 border-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              Catálogo
            </button>
            {isAdmin && (
              <button 
                onClick={() => setCurrentView('dashboard')}
                className={cn(
                  "text-sm font-bold uppercase tracking-wider px-2 py-1 transition-all",
                  currentView === 'dashboard' ? "text-[var(--primary)] border-b-2 border-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                )}
              >
                Dashboard
              </button>
            )}
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          {currentView === 'catalog' && (
            <div className="relative w-64 hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input 
                type="text" 
                placeholder="Buscar productos..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-[#f1f5f9] border border-[var(--border)] rounded-full text-sm focus:outline-none"
              />
            </div>
          )}
          
          <div className="admin-login text-[0.85rem] bg-[#f1f5f9] px-3 py-1.5 rounded-md border border-[var(--border)] font-medium">
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline">Sesión: <strong>Admin</strong></span>
                <button onClick={() => setIsAdmin(false)} className="text-red-500 hover:text-red-600"><LogOut className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-1 hover:text-[var(--primary)] text-[var(--text-main)] transition-colors">
                <UserIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Acceso Admin</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {currentView === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="h-full overflow-y-auto"
            >
              {/* Hero */}
              <section className="relative h-[400px] flex items-center justify-center bg-neutral-900 text-white overflow-hidden">
                <img 
                  src="https://picsum.photos/seed/office/1920/600?blur=4" 
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                  referrerPolicy="no-referrer"
                />
                <div className="relative z-10 text-center max-w-3xl px-4">
                  <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">Soluciones Integrales para tu <span className="text-blue-500">Imagen de Marca</span></h1>
                  <p className="text-lg md:text-xl text-neutral-300 mb-8">Especialistas en Marketing Promocional, Material POP y Ropa Corporativa con alcance regional.</p>
                  <button 
                    onClick={() => setCurrentView('catalog')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-bold text-lg transition-transform active:scale-95"
                  >
                    Ver Catálogo
                  </button>
                </div>
              </section>

              {/* Quienes Somos */}
              <section className="py-20 px-8 max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <h2 className="text-3xl font-extrabold mb-6 flex items-center gap-3">
                    <span className="w-8 h-1 bg-blue-600 rounded-full" /> Quiénes somos
                  </h2>
                  <p className="text-neutral-600 mb-4 leading-relaxed">
                    Somos una empresa Multi producto con experiencia en **Marketing Promocional**, **Material POP** y **Mobiliario**, con oficinas estratégicas en Chile y Oriente.
                  </p>
                  <p className="text-neutral-600 mb-4 leading-relaxed">
                    Nos enfocamos en el diseño y desarrollo de productos innovadores, siendo el aliado perfecto para complementar campañas de alto impacto y aumentar la imagen de marca a precios competitivos.
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-8">
                    <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm">
                      <h4 className="font-bold text-blue-600 text-xs uppercase mb-1">Innovación</h4>
                      <p className="text-xs text-neutral-500">Búsqueda constante de tendencias.</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm">
                      <h4 className="font-bold text-blue-600 text-xs uppercase mb-1">Calidad</h4>
                      <p className="text-xs text-neutral-500">Auditamos más de 200 proveedores.</p>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  <img src="https://picsum.photos/seed/work/800/600" className="rounded-[2.5rem] shadow-2xl" referrerPolicy="no-referrer" />
                  <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-3xl shadow-xl border border-neutral-100 hidden sm:block">
                    <p className="text-3xl font-black text-blue-600 line-height-1">+15</p>
                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Años de Experiencia</p>
                  </div>
                </div>
              </section>

              {/* Clients Grid */}
              <section className="py-20 bg-neutral-50 px-8">
                <div className="max-w-6xl mx-auto">
                  <h3 className="text-center text-sm font-bold text-neutral-400 uppercase tracking-[0.3em] mb-12">Marcas que confían en nosotros</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-8 opacity-60 grayscale hover:grayscale-0 transition-all">
                    {['Coca-Cola', 'Dove', 'Ponds', 'Eucerin', 'Lays', 'Johnnie Walker', 'Mars', 'Mistral', 'Husqvarna', 'Juan Valdez', 'Roche Posay', 'Red Bull'].map(brand => (
                      <div key={brand} className="flex items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-neutral-100 font-bold text-neutral-400">
                        {brand}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Contact Footer (Repeated for Home) */}
              <footer className="bg-neutral-900 text-white py-20 px-8">
                 <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16">
                    <div>
                      <h2 className="text-3xl font-bold mb-6">¿Interesado en una solución a medida?</h2>
                      <p className="text-neutral-400 mb-8">Nuestro equipo técnico en Chile y Oriente está listo para materializar tus ideas promocionales.</p>
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 text-neutral-300">
                          <Phone className="w-5 h-5 text-blue-500" /> +56 9 7775 5487
                        </div>
                        <div className="flex items-center gap-4 text-neutral-300">
                          <Mail className="w-5 h-5 text-blue-500" /> contacto@ihmchile.com
                        </div>
                      </div>
                    </div>
                    <form className="space-y-4">
                       <input type="text" placeholder="Nombre completo" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
                       <input type="email" placeholder="Correo electrónico" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
                       <textarea placeholder="Cuéntanos tu proyecto..." rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500" />
                       <button className="w-full bg-blue-600 py-4 rounded-xl font-bold hover:bg-blue-700">Enviar mensaje</button>
                    </form>
                 </div>
              </footer>
            </motion.div>
          ) : currentView === 'catalog' ? (
            <motion.div 
              key="catalog"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="main-flex"
            >
              
              {/* --- Sidebar --- */}
              <aside className="sidebar-w bg-white border-r border-[var(--border)] p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h3 className="text-[0.75rem] font-bold uppercase text-[var(--text-muted)] mb-3 tracking-wider">Categorías</h3>
            <div className="space-y-0.5">
              <button 
                onClick={() => setSelectedCategory('All')}
                className={cn(
                  "w-full text-left py-2 px-1 text-[0.9rem] transition-colors border-b border-transparent",
                  selectedCategory === 'All' ? "text-[var(--primary)] font-bold" : "text-[var(--text-main)] hover:text-[var(--primary)]"
                )}
              >
                Todos los productos
              </button>
              {categories.map(cat => (
                <button 
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.name)}
                  className={cn(
                    "w-full text-left py-2 px-1 text-[0.9rem] transition-colors border-b border-transparent",
                    selectedCategory === cat.name ? "text-[var(--primary)] font-bold" : "text-[var(--text-main)] hover:text-[var(--primary)]"
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[0.75rem] font-bold uppercase text-[var(--text-muted)] mb-3 tracking-wider">Filtros</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[0.85rem] text-[var(--text-main)] cursor-pointer">
                <input type="checkbox" checked className="rounded text-[var(--primary)]" readOnly /> 
                En Stock
              </label>
              <label className="flex items-center gap-2 text-[0.85rem] text-[var(--text-main)] cursor-pointer">
                <input type="checkbox" className="rounded text-[var(--primary)]" readOnly /> 
                Promociones
              </label>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-[var(--border)]">
            <h3 className="text-[0.75rem] font-bold uppercase text-[var(--text-muted)] mb-3 tracking-wider">Contacto</h3>
            <div className="text-[0.8rem] space-y-1 text-[var(--text-muted)]">
              <p className="flex items-center gap-2"><Phone className="w-3 h-3" /> +56 9 7775 5487</p>
              <p className="flex items-center gap-2"><Mail className="w-3 h-3" /> contacto@ihmchile.com</p>
              <div className="flex gap-2 pt-2">
                <Instagram className="w-4 h-4 hover:text-[var(--primary)] cursor-pointer" />
                <Facebook className="w-4 h-4 hover:text-[var(--primary)] cursor-pointer" />
              </div>
            </div>
          </div>
        </aside>

        {/* --- Catalog --- */}
        <section className="catalog-grow bg-[#f8fafc] p-5 flex flex-col">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-[1.1rem] font-bold text-[var(--text-main)]">Catálogo de Productos</h2>
            <div className="flex items-center gap-3">
              <span className="text-[0.75rem] text-[var(--text-muted)] italic">
                Mostrando {filteredProducts.length} items
              </span>
              <select className="bg-white border border-[var(--border)] rounded px-2 py-1 text-[0.8rem] focus:outline-none focus:border-[var(--primary)]">
                <option>Ordenar por: Relevancia</option>
                <option>A-Z</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.map(product => (
              <motion.div 
                layout
                key={product.id} 
                onClick={() => { setSelectedProduct(product); setCurrentView('product'); }}
                className="bg-white border border-[var(--border)] rounded-lg p-3 relative group cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="h-40 bg-[#f1f5f9] rounded-md overflow-hidden mb-3 relative">
                  <img 
                    src={product.imageUrl || `https://picsum.photos/seed/${product.name}/400/400`} 
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <span className={cn(
                    "absolute top-2 right-2 text-[0.7rem] px-1.5 py-0.5 rounded-md font-bold uppercase",
                    product.stock > 0 ? "bg-[#dcfce7] text-[#166534]" : "bg-red-100 text-red-600"
                  )}>
                    {product.stock > 0 ? 'Disponible' : 'Sin Stock'}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-[0.85rem] font-bold truncate text-[var(--text-main)]">{product.name}</h3>
                  <p className="text-[var(--text-muted)] text-[0.75rem]">{product.category}</p>
                </div>
                
                {isAdmin && (
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-white/95 border-t border-[var(--border)] opacity-0 group-hover:opacity-100 transition-opacity flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setEditingProduct(product)}
                      className="p-1.5 hover:bg-[var(--bg)] rounded-md text-[var(--text-muted)] hover:text-[var(--primary)]"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteProduct(product.id!)}
                      className="p-1.5 hover:bg-[var(--bg)] rounded-md text-[var(--text-muted)] hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] italic text-sm py-20">
              No se encontraron productos en esta categoría.
            </div>
          )}
        </section>

        {/* --- Admin Panel (Category Management) --- */}
        <aside className="panel-w bg-white border-l border-[var(--border)] p-5 flex flex-col gap-6 overflow-hidden">
          
          {isAdmin ? (
            <div className="flex flex-col gap-6 h-full">
              <div className="flex items-center justify-between">
                <h3 className="text-[0.9rem] font-bold flex items-center gap-2">
                  <span className="p-1 bg-blue-100 rounded text-blue-600">⚙️</span> Gestión Rápida
                </h3>
                <button 
                  onClick={() => setEditingProduct({ name: '', price: 0, stock: 0, category: categories[0]?.name || '', description: '', imageUrl: '' })}
                  className="bg-[var(--primary)] text-white p-1 rounded-md hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Nuevas Categorías</h4>
                <form onSubmit={handleCreateCategory} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Nombre..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="flex-1 bg-neutral-100 border border-transparent rounded-lg px-3 py-2 text-xs focus:bg-white focus:border-blue-500 outline-none"
                  />
                  <button type="submit" className="bg-blue-600 text-white p-2 rounded-lg"><PlusCircle className="w-4 h-4" /></button>
                </form>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2">
                <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Categorías Existentes</h4>
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-2 bg-neutral-50 rounded-lg border border-neutral-100 text-xs">
                    <span className="font-medium">{cat.name}</span>
                    <button onClick={() => handleDeleteCategory(cat.id!)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
               <div className="w-12 h-12 bg-[#f1f5f9] rounded-full flex items-center justify-center text-[var(--text-muted)] mb-4">
                  <UserIcon className="w-6 h-6" />
               </div>
               <h4 className="font-bold text-sm mb-1">Acceso Restringido</h4>
               <p className="text-[10px] text-neutral-400 mb-4">Inicia sesión para gestionar el contenido.</p>
               <button 
                onClick={() => setShowLogin(true)}
                className="text-xs font-bold text-[var(--primary)] hover:underline"
               >
                 Abrir Login
               </button>
            </div>
          )}
        </aside>
      </motion.div>
    ) : currentView === 'product' ? (
      <motion.div 
        key="product"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="h-full overflow-y-auto bg-white"
      >
        {selectedProduct ? (
          <div className="max-w-6xl mx-auto py-12 px-8">
            <button 
              onClick={() => setCurrentView('catalog')}
              className="text-sm font-bold text-[var(--primary)] mb-8 flex items-center gap-1 hover:underline"
            >
              ← Volver al catálogo
            </button>
            
            <div className="grid md:grid-cols-2 gap-12">
              <div className="rounded-3xl overflow-hidden border border-[var(--border)] bg-[#f8fafc]">
                <img 
                  src={selectedProduct.imageUrl || `https://picsum.photos/seed/${selectedProduct.name}/800/800`} 
                  alt={selectedProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto object-cover"
                />
              </div>
              <div className="space-y-6">
                <div>
                  <span className="text-[var(--primary)] font-bold text-xs uppercase tracking-[0.2em]">{selectedProduct.category}</span>
                  <h1 className="text-4xl font-black mt-2 mb-4 leading-tight">{selectedProduct.name}</h1>
                  <p className="text-xl text-neutral-600 leading-relaxed italic border-l-4 border-blue-500 pl-6">
                    {selectedProduct.description || 'Sin descripción disponible.'}
                  </p>
                </div>
                
                <div className="p-6 bg-[#f1f5f9] rounded-2xl border border-[var(--border)]">
                  <h4 className="font-bold text-sm mb-4">Información técnica y stock</h4>
                  <div className="space-y-2 text-sm">
                    <p className="flex justify-between">
                      <span className="text-neutral-500">Estado:</span>
                      <span className={cn("font-bold", selectedProduct.stock > 0 ? "text-green-600" : "text-red-600")}>
                        {selectedProduct.stock > 0 ? 'En Stock para despacho inmediato' : 'Próxima llegada'}
                      </span>
                    </p>
                    <p className="flex justify-between">
                        <span className="text-neutral-500">Unidades disponibles:</span>
                        <span className="font-bold">{selectedProduct.stock} unidades</span>
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-6">
                  <h3 className="font-bold text-lg">Cotizar este producto</h3>
                  <p className="text-sm text-neutral-500">Completa el formulario y un ejecutivo te contactará con una propuesta comercial personalizada.</p>
                  <form onSubmit={handleQuoteSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="text" 
                        placeholder="Tu nombre" 
                        required
                        value={quoteForm.name}
                        onChange={(e) => setQuoteForm({...quoteForm, name: e.target.value})}
                        className="bg-[#f1f5f9] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                      />
                      <input 
                        type="email" 
                        placeholder="Tu correo" 
                        required
                        value={quoteForm.email}
                        onChange={(e) => setQuoteForm({...quoteForm, email: e.target.value})}
                        className="bg-[#f1f5f9] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" 
                      />
                    </div>
                    <button type="submit" className="w-full bg-[var(--primary)] text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors">
                      Solicitar Cotización Especial
                    </button>
                  </form>
                </div>
              </div>
            </div>

            {/* Cross-selling or more info */}
            <div className="mt-24 pt-12 border-t border-[var(--border)]">
                <h2 className="text-2xl font-bold mb-8">Por qué elegir IHM Chile</h2>
                <div className="grid md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                        <h4 className="font-bold text-blue-600 uppercase text-xs">Calidad Garantizada</h4>
                        <p className="text-sm text-neutral-500">Auditamos internacionalmente cada proceso de fabricación.</p>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-bold text-blue-600 uppercase text-xs">Entrega Regional</h4>
                        <p className="text-sm text-neutral-500">Logística eficiente a todo Chile en tiempo récord.</p>
                    </div>
                    <div className="space-y-2">
                        <h4 className="font-bold text-blue-600 uppercase text-xs">Atención Proactiva</h4>
                        <p className="text-sm text-neutral-500">Asesoría experta en material POP y marketing promocional.</p>
                    </div>
                </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <button onClick={() => setCurrentView('catalog')} className="text-blue-600 font-bold">Volver al catálogo</button>
          </div>
        )}
      </motion.div>
    ) : currentView === 'dashboard' ? (
      <motion.div 
        key="dashboard"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="h-full overflow-y-auto bg-neutral-50 p-8"
      >
        <div className="max-w-7xl mx-auto space-y-8">
          <header className="flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black">Admin Dashboard</h1>
              <p className="text-neutral-500">Gestiona tu catálogo, categorías y revisa tus cotizaciones.</p>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setShowBulkUpload(true)}
                className="bg-neutral-800 text-white px-6 py-2 rounded-xl font-bold hover:bg-black flex items-center gap-2 text-sm shadow-sm"
              >
                <FileSpreadsheet className="w-4 h-4" /> Importar Excel
              </button>
              <button 
                onClick={() => setEditingProduct({ name: '', price: 0, stock: 0, category: categories[0]?.name || '', description: '', imageUrl: '' })}
                className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-blue-700 flex items-center gap-2 text-sm shadow-sm"
              >
                <Plus className="w-4 h-4" /> Nuevo Producto
              </button>
            </div>
          </header>

          {/* Dashboard Tabs / Filters */}
          <div className="flex items-center gap-4">
            <div className="flex bg-white rounded-xl p-1 border border-neutral-200 shadow-sm overflow-x-auto">
               <button 
                onClick={() => setDashCategory('All')}
                className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap", dashCategory === 'All' ? "bg-blue-600 text-white" : "text-neutral-500 hover:bg-neutral-100")}
               >Todos</button>
               {categories.map(c => (
                 <button 
                  key={c.id}
                  onClick={() => setDashCategory(c.name)}
                  className={cn("px-4 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap", dashCategory === c.name ? "bg-blue-600 text-white" : "text-neutral-500 hover:bg-neutral-100")}
                 >{c.name}</button>
               ))}
            </div>
            <div className="flex-1" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Productos</h4>
              <p className="text-3xl font-black">{products.length}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Total Categorías</h4>
              <p className="text-3xl font-black">{categories.length}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Cotizaciones Totales</h4>
              <p className="text-3xl font-black text-blue-600">{quotes.length}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-neutral-100 shadow-sm">
              <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Bajo Stock ( {'< 10'} )</h4>
              <p className="text-3xl font-black text-orange-500">{products.filter(p => p.stock < 10).length}</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Quotes Table */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden flex flex-col">
              <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
                <h3 className="font-bold">Cotizaciones Recientes</h3>
              </div>
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 text-neutral-400 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="px-6 py-4">Producto</th>
                      <th className="px-6 py-4">Cliente</th>
                      <th className="px-6 py-4">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {quotes.map(q => (
                      <tr key={q.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4 font-bold">{q.productName}</td>
                        <td className="px-6 py-4">
                          <p className="font-medium text-neutral-900">{q.clientName}</p>
                          <p className="text-xs text-neutral-400">{q.clientEmail}</p>
                        </td>
                        <td className="px-6 py-4 text-neutral-500 text-xs">
                          {q.createdAt?.toDate ? q.createdAt.toDate().toLocaleString('es-CL') : 'Pendiente'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {quotes.length === 0 && <div className="p-12 text-center text-neutral-400 italic">No hay cotizaciones aún.</div>}
              </div>
            </div>

            {/* Categories Management */}
            <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 space-y-6">
              <h3 className="font-bold">Gestionar Categorías</h3>
              <form onSubmit={handleCreateCategory} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Nueva categoría..." 
                  className="flex-1 bg-neutral-100 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button type="submit" className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700">
                  <Plus className="w-4 h-4" />
                </button>
              </form>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                {categories.map(cat => (
                  <div key={cat.id} className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                    <span className="text-sm font-medium">{cat.name}</span>
                    <button onClick={() => handleDeleteCategory(cat.id!)} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Product Stock Quick Management */}
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 overflow-hidden">
            <h3 className="font-bold mb-6">Inventario Rápido</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
               {products
                .filter(p => dashCategory === 'All' || p.category === dashCategory)
                .map(p => (
                 <div key={p.id} className="p-3 bg-white rounded-xl border border-neutral-100 text-center space-y-2 relative group shadow-sm hover:border-blue-300 transition-colors">
                    <img src={p.imageUrl} className="w-12 h-12 object-cover rounded-lg mx-auto mb-2" />
                    <p className="text-[10px] font-bold truncate px-2">{p.name}</p>
                    <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => updateDoc(doc(db, 'products', p.id!), { stock: Math.max(0, p.stock - 1) })}
                          className="w-6 h-6 bg-red-100 text-red-600 rounded flex items-center justify-center text-xs"
                        >-</button>
                        <span className="text-xs font-black">{p.stock}</span>
                        <button 
                          onClick={() => updateDoc(doc(db, 'products', p.id!), { stock: p.stock + 1 })}
                          className="w-6 h-6 bg-green-100 text-green-600 rounded flex items-center justify-center text-xs"
                        >+</button>
                    </div>
                    <button 
                      onClick={() => setEditingProduct(p)}
                      className="absolute -top-1 -right-1 p-1 bg-white border border-neutral-200 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Edit2 className="w-3 h-3 text-neutral-400" />
                    </button>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </motion.div>
    ) : null}
  </AnimatePresence>
</main>

      {/* --- Modals --- */}
      <AnimatePresence>
        {showLogin && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowLogin(false)}
              className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm relative z-10"
            >
              <h2 className="text-xl font-bold mb-6">Acceso Administrador</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Usuario</label>
                  <input 
                    autoFocus type="text" required
                    value={loginData.user}
                    onChange={(e) => setLoginData({...loginData, user: e.target.value})}
                    className="w-full bg-neutral-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase mb-1 block">Contraseña</label>
                  <input 
                    type="password" required
                    value={loginData.pass}
                    onChange={(e) => setLoginData({...loginData, pass: e.target.value})}
                    className="w-full bg-neutral-100 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
                  />
                </div>
                <button type="submit" className="w-full bg-[var(--primary)] text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition-colors">
                  Ingresar
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {editingProduct && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setEditingProduct(null)}
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl relative z-[301]"
            >
              <h3 className="text-lg font-bold mb-4">{editingProduct.id ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <form onSubmit={handleCreateProduct} className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Nombre</label>
                  <input 
                    type="text" required
                    value={editingProduct.name}
                    onChange={(e) => setEditingProduct({...editingProduct, name: e.target.value})}
                    className="w-full bg-[#f1f5f9] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Categoría</label>
                  <select 
                    value={editingProduct.category}
                    onChange={(e) => setEditingProduct({...editingProduct, category: e.target.value})}
                    className="w-full bg-[#f1f5f9] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none"
                  >
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="hidden"> {/* Hide price as per user request to remove it */}
                  <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Precio</label>
                  <input 
                    type="number"
                    value={editingProduct.price || 0}
                    onChange={(e) => setEditingProduct({...editingProduct, price: Number(e.target.value)})}
                    className="w-full bg-[#f1f5f9] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div className="col-span-1">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Stock</label>
                  <input 
                    type="number" required
                    value={editingProduct.stock}
                    onChange={(e) => setEditingProduct({...editingProduct, stock: Number(e.target.value)})}
                    className="w-full bg-[#f1f5f9] border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-neutral-400 uppercase block mb-1">Imagen (Click para subir)</label>
                  <div 
                    onClick={handleUploadClick}
                    className="w-full h-24 bg-neutral-100 border-2 border-dashed border-neutral-300 rounded-xl flex items-center justify-center cursor-pointer hover:bg-neutral-200"
                  >
                    {editingProduct.imageUrl ? (
                      <img src={editingProduct.imageUrl} className="h-full w-auto object-contain" />
                    ) : (
                      <Plus className="w-5 h-5 text-neutral-400" />
                    )}
                  </div>
                </div>
                <div className="col-span-2 flex gap-2 mt-2">
                  <button 
                    type="button"
                    onClick={() => setEditingProduct(null)}
                    className="flex-1 bg-neutral-100 py-2 rounded-md font-bold text-xs hover:bg-neutral-200"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-[var(--primary)] text-white py-2 rounded-md font-bold text-xs hover:bg-blue-700"
                  >
                    {editingProduct.id ? 'Guardar' : 'Crear'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {showBulkUpload && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowBulkUpload(false)}
              className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-2xl relative z-[301] text-center"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold mb-2">Importar Catálogo</h3>
              <p className="text-sm text-neutral-500 mb-6">Sube un archivo Excel (.xlsx) con las columnas:<br/><strong>Nombre del Producto, Stock, Categoría, Disponibilidad</strong></p>
              
              <label className="block w-full bg-blue-600 text-white py-3 rounded-xl font-bold cursor-pointer hover:bg-blue-700 transition-colors">
                Seleccionar Archivo
                <input type="file" accept=".xlsx, .xls" onChange={handleBulkUpload} className="hidden" />
              </label>
              
              <button 
                onClick={() => setShowBulkUpload(false)}
                className="mt-4 text-xs font-bold text-neutral-400 hover:text-neutral-600"
              >
                Cancelar
              </button>
            </motion.div>
          </div>
        )}

        {bulkLog && (
          <div className="fixed bottom-24 left-8 z-[400] max-w-sm w-full">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white border border-neutral-200 rounded-2xl shadow-2xl p-6 relative overflow-hidden"
            >
              <button 
                onClick={() => setBulkLog(null)}
                className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                    <Package className="w-5 h-5" />
                 </div>
                 <div>
                    <h4 className="font-bold text-sm">Carga Completada</h4>
                    <p className="text-xs text-neutral-500">Se procesaron {bulkLog.success + bulkLog.errors.length} filas.</p>
                 </div>
              </div>
              
              <div className="space-y-2">
                 <div className="bg-green-50 text-green-700 p-2 rounded-lg text-[10px] font-bold">
                    ✅ {bulkLog.success} productos subidos con éxito.
                 </div>
                 {bulkLog.errors.length > 0 && (
                   <div className="bg-red-50 text-red-700 p-3 rounded-lg text-[10px] space-y-1 max-h-[150px] overflow-y-auto">
                      <p className="font-bold border-b border-red-100 pb-1 mb-1">❌ Errores ({bulkLog.errors.length}):</p>
                      {bulkLog.errors.map((err, i) => <p key={i}>• {err}</p>)}
                   </div>
                 )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <a 
        href="https://wa.me/56982494342" 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed bottom-8 right-8 z-[500] bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:scale-110 transition-transform flex items-center justify-center"
        title="Contáctanos por WhatsApp"
      >
        <MessageCircle className="w-8 h-8" />
      </a>

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
        .border-bottom { border-bottom-width: 1px; }
        .border-top { border-top-width: 1px; }
      `}</style>
    </div>
  );
}
