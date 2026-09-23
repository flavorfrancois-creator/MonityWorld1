import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, Package, Filter, MoreVertical } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose
} from '../../components/ui/dialog';
import { Label } from '../../components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';

const MERCHANT_API = '/merchant';

const CATEGORIES = [
  'Alimentation', 'Boissons', 'Électronique', 'Vêtements', 'Services', 
  'Santé', 'Beauté', 'Maison', 'Sport', 'Autre'
];

export default function MerchantProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    currency: 'USD',
    category: '',
    sku: '',
    stock: '',
    is_active: true
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/products`);
      setProducts(res.data.products);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        price: parseFloat(form.price),
        stock: form.stock ? parseInt(form.stock) : null
      };

      if (editProduct) {
        await API.patch(`${MERCHANT_API}/products/${editProduct.id}`, payload);
        toast.success('Produit mis à jour');
      } else {
        await API.post(`${MERCHANT_API}/products`, payload);
        toast.success('Produit créé');
      }
      
      setShowForm(false);
      setEditProduct(null);
      resetForm();
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleEdit = (product) => {
    setEditProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      currency: product.currency,
      category: product.category || '',
      sku: product.sku || '',
      stock: product.stock?.toString() || '',
      is_active: product.is_active
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer ce produit ?')) return;
    try {
      await API.delete(`${MERCHANT_API}/products/${id}`);
      toast.success('Produit supprimé');
      fetchProducts();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      description: '',
      price: '',
      currency: 'USD',
      category: '',
      sku: '',
      stock: '',
      is_active: true
    });
  };

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                       p.sku?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produits & Services</h1>
          <p className="text-muted-foreground">{products.length} produit(s) enregistré(s)</p>
        </div>
        <Dialog open={showForm} onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setEditProduct(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" data-testid="add-product-btn">
              <Plus size={16} />
              <span>Ajouter un produit</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editProduct ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Nom du produit *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="Ex: Café expresso"
                  required
                />
              </div>
              
              <div>
                <Label>Description</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  placeholder="Description optionnelle"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prix *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({...form, price: e.target.value})}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <Label>Devise</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({...form, currency: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="XAF">XAF</SelectItem>
                      <SelectItem value="CDF">CDF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Catégorie</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({...form, category: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>SKU</Label>
                  <Input
                    value={form.sku}
                    onChange={(e) => setForm({...form, sku: e.target.value})}
                    placeholder="Code unique"
                  />
                </div>
              </div>
              
              <div>
                <Label>Stock (vide = illimité)</Label>
                <Input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({...form, stock: e.target.value})}
                  placeholder="Quantité disponible"
                />
              </div>
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Annuler</Button>
                </DialogClose>
                <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600">
                  {editProduct ? 'Modifier' : 'Créer'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou SKU..."
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter size={16} className="mr-2" />
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes catégories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Products Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <Card key={product.id} className="hover:border-emerald-500/30 transition-colors">
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Package className="text-emerald-500" size={24} />
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(product)}>
                      <Edit2 size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(product.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                
                <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
                {product.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{product.description}</p>
                )}
                
                <div className="flex items-center justify-between mt-3">
                  <p className="text-lg font-bold text-emerald-500">
                    {product.price} {product.currency}
                  </p>
                  {product.stock !== null && (
                    <Badge variant={product.stock > 0 ? 'default' : 'destructive'} className="text-xs">
                      {product.stock > 0 ? `${product.stock} en stock` : 'Rupture'}
                    </Badge>
                  )}
                </div>
                
                {product.category && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    {product.category}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto mb-3 text-muted-foreground" size={48} />
            <h3 className="text-lg font-semibold text-foreground">Aucun produit</h3>
            <p className="text-muted-foreground mt-1">
              {search || categoryFilter !== 'all' 
                ? 'Aucun produit ne correspond à votre recherche' 
                : 'Commencez par ajouter vos produits ou services'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
