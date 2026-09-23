import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { 
  Plus, Minus, Search, ShoppingCart, CreditCard, Banknote, 
  Smartphone, Trash2, CheckCircle, X, Package
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';

const MERCHANT_API = '/merchant';

export default function MerchantPOS() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [clientPhone, setClientPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [lastTransaction, setLastTransaction] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/products`);
      setProducts(res.data.products.filter(p => p.is_active));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        description: product.name,
        quantity: 1,
        unit_price: product.price
      }]);
    }
    setCurrency(product.currency);
  };

  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
  };

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const total = subtotal - discount;

  const handlePayment = async () => {
    if (cart.length === 0) return;
    
    setProcessing(true);
    try {
      const payload = {
        items: cart,
        currency,
        payment_method: paymentMethod,
        client_phone: paymentMethod === 'monity' ? clientPhone : null,
        discount_amount: discount
      };
      
      const res = await API.post(`${MERCHANT_API}/pos/transaction`, payload);
      toast.success('Vente enregistrée!');
      setLastTransaction(res.data.transaction);
      clearCart();
      setShowPayment(false);
      setClientPhone('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de paiement');
    } finally {
      setProcessing(false);
    }
  };

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="pb-20 lg:pb-0">
      {/* Success Modal */}
      <Dialog open={!!lastTransaction} onOpenChange={() => setLastTransaction(null)}>
        <DialogContent className="max-w-sm text-center">
          <div className="py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="text-emerald-500" size={32} />
            </div>
            <h2 className="text-xl font-bold text-foreground">Vente réussie!</h2>
            <p className="text-2xl font-bold text-emerald-500 mt-2">
              {lastTransaction?.total} {lastTransaction?.currency}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {lastTransaction?.payment_method === 'cash' ? 'Paiement en espèces' : 
               lastTransaction?.payment_method === 'monity' ? 'Paiement Monity' : 'Paiement carte'}
            </p>
          </div>
          <Button onClick={() => setLastTransaction(null)} className="w-full bg-emerald-500 hover:bg-emerald-600">
            Nouvelle vente
          </Button>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Products Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un produit..."
                className="pl-10"
              />
            </div>
          </div>

          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((product) => (
                <Card
                  key={product.id}
                  className="cursor-pointer hover:border-emerald-500/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                  onClick={() => addToCart(product)}
                >
                  <CardContent className="p-3 text-center">
                    <div className="w-12 h-12 rounded-lg bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                      <Package className="text-emerald-500" size={24} />
                    </div>
                    <p className="font-medium text-sm text-foreground truncate">{product.name}</p>
                    <p className="text-emerald-500 font-bold mt-1">
                      {product.price} {product.currency}
                    </p>
                    {product.category && (
                      <Badge variant="outline" className="text-xs mt-1">{product.category}</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="mx-auto mb-3 text-muted-foreground" size={48} />
                <p className="text-muted-foreground">
                  {search ? 'Aucun produit trouvé' : 'Ajoutez des produits pour commencer'}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Cart Section */}
        <div className="space-y-4">
          <Card className="sticky top-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart size={20} />
                  Panier
                </CardTitle>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearCart} className="text-destructive">
                    <Trash2 size={14} className="mr-1" />
                    Vider
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length > 0 ? (
                <>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {cart.map((item) => (
                      <div key={item.product_id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{item.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.unit_price} {currency} x {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product_id, -1)}
                            >
                              <Minus size={12} />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => updateQuantity(item.product_id, 1)}
                            >
                              <Plus size={12} />
                            </Button>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => removeFromCart(item.product_id)}
                          >
                            <X size={14} className="text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Discount */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Remise</Label>
                    <Input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                      className="h-8 w-24"
                      placeholder="0"
                    />
                    <span className="text-sm text-muted-foreground">{currency}</span>
                  </div>

                  {/* Totals */}
                  <div className="border-t pt-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sous-total</span>
                      <span>{subtotal.toFixed(2)} {currency}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-emerald-500">
                        <span>Remise</span>
                        <span>-{discount.toFixed(2)} {currency}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-emerald-500">{total.toFixed(2)} {currency}</span>
                    </div>
                  </div>

                  <Button 
                    className="w-full bg-emerald-500 hover:bg-emerald-600"
                    onClick={() => setShowPayment(true)}
                  >
                    Passer au paiement
                  </Button>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="mx-auto mb-2 opacity-50" size={32} />
                  <p>Panier vide</p>
                  <p className="text-xs">Cliquez sur un produit pour l'ajouter</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mode de paiement</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-center py-4 bg-secondary/30 rounded-lg">
              <p className="text-sm text-muted-foreground">Total à payer</p>
              <p className="text-3xl font-bold text-emerald-500">{total.toFixed(2)} {currency}</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'cash', icon: Banknote, label: 'Espèces' },
                { value: 'monity', icon: Smartphone, label: 'Monity' },
                { value: 'card', icon: CreditCard, label: 'Carte' },
              ].map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant={paymentMethod === value ? 'default' : 'outline'}
                  className={`flex flex-col h-20 ${paymentMethod === value ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                  onClick={() => setPaymentMethod(value)}
                >
                  <Icon size={24} />
                  <span className="text-xs mt-1">{label}</span>
                </Button>
              ))}
            </div>

            {paymentMethod === 'monity' && (
              <div>
                <Label>Numéro Monity du client</Label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+243..."
                />
              </div>
            )}
          </div>
          
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button 
              onClick={handlePayment}
              disabled={processing || (paymentMethod === 'monity' && !clientPhone)}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              {processing ? 'Traitement...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
