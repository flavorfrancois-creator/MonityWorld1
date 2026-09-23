import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { 
  Plus, Search, FileText, Send, Eye, Ban, Trash2, Filter, 
  CheckCircle, Clock, AlertCircle, XCircle, Download, QrCode, FileDown, FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose
} from '../../components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '../../components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '../../components/ui/dropdown-menu';

const MERCHANT_API = '/merchant';

const STATUS_CONFIG = {
  draft: { label: 'Brouillon', color: 'secondary', icon: FileText },
  sent: { label: 'Envoyée', color: 'blue', icon: Send },
  viewed: { label: 'Vue', color: 'purple', icon: Eye },
  partial: { label: 'Partiel', color: 'amber', icon: AlertCircle },
  paid: { label: 'Payée', color: 'emerald', icon: CheckCircle },
  cancelled: { label: 'Annulée', color: 'destructive', icon: XCircle },
  overdue: { label: 'En retard', color: 'destructive', icon: Clock }
};

export default function MerchantInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  
  const [form, setForm] = useState({
    client_name: '',
    client_phone: '',
    client_email: '',
    client_address: '',
    currency: 'USD',
    due_date: '',
    notes: '',
    discount_amount: 0,
    discount_type: 'fixed',
    items: [{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]
  });

  useEffect(() => {
    fetchInvoices();
    fetchProducts();
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/invoices`);
      setInvoices(res.data.invoices);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/products`);
      setProducts(res.data.products);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const addItem = () => {
    setForm({
      ...form,
      items: [...form.items, { description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]
    });
  };

  const removeItem = (index) => {
    if (form.items.length > 1) {
      setForm({
        ...form,
        items: form.items.filter((_, i) => i !== index)
      });
    }
  };

  const updateItem = (index, field, value) => {
    const newItems = [...form.items];
    newItems[index][field] = value;
    setForm({ ...form, items: newItems });
  };

  const selectProduct = (index, productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      updateItem(index, 'description', product.name);
      updateItem(index, 'unit_price', product.price);
      updateItem(index, 'product_id', productId);
    }
  };

  const calculateTotal = () => {
    let subtotal = 0;
    let tax = 0;
    form.items.forEach(item => {
      const itemTotal = item.quantity * item.unit_price;
      subtotal += itemTotal;
      tax += itemTotal * (item.tax_rate / 100);
    });
    const discount = form.discount_type === 'percentage' 
      ? subtotal * (form.discount_amount / 100)
      : form.discount_amount;
    return { subtotal, tax, discount, total: subtotal + tax - discount };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        items: form.items.map(item => ({
          ...item,
          quantity: parseFloat(item.quantity),
          unit_price: parseFloat(item.unit_price),
          tax_rate: parseFloat(item.tax_rate || 0)
        })),
        discount_amount: parseFloat(form.discount_amount || 0)
      };
      
      await API.post(`${MERCHANT_API}/invoices`, payload);
      toast.success('Facture créée');
      setShowForm(false);
      resetForm();
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleSend = async (id) => {
    try {
      await API.patch(`${MERCHANT_API}/invoices/${id}/send`);
      toast.success('Facture envoyée au client');
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('Annuler cette facture ?')) return;
    try {
      await API.patch(`${MERCHANT_API}/invoices/${id}/cancel`);
      toast.success('Facture annulée');
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Supprimer cette facture ?')) return;
    try {
      await API.delete(`${MERCHANT_API}/invoices/${id}`);
      toast.success('Facture supprimée');
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await API.get(`${MERCHANT_API}/invoices/export/csv`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'factures.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export CSV téléchargé');
    } catch (err) {
      toast.error('Erreur lors de l\'export');
    }
  };

  const handleExportPDF = async (invoiceId) => {
    try {
      const response = await API.get(`${MERCHANT_API}/invoices/${invoiceId}/export/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `facture-${invoiceId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('PDF téléchargé');
    } catch (err) {
      toast.error('Erreur lors de l\'export PDF');
    }
  };

  const resetForm = () => {
    setForm({
      client_name: '',
      client_phone: '',
      client_email: '',
      client_address: '',
      currency: 'USD',
      due_date: '',
      notes: '',
      discount_amount: 0,
      discount_type: 'fixed',
      items: [{ description: '', quantity: 1, unit_price: 0, tax_rate: 0 }]
    });
  };

  const filtered = invoices.filter(inv => {
    const matchSearch = inv.client_name?.toLowerCase().includes(search.toLowerCase()) ||
                       inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totals = calculateTotal();

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
          <h1 className="text-2xl font-bold text-foreground">Factures</h1>
          <p className="text-muted-foreground">{invoices.length} facture(s)</p>
        </div>
        <div className="flex gap-2">
          {/* Export Button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" data-testid="export-invoices-btn">
                <FileDown size={16} />
                <span className="hidden sm:inline">Exporter</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={handleExportCSV}>
                <FileSpreadsheet size={16} className="mr-2" />
                Exporter en CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Dialog open={showForm} onOpenChange={(open) => {
            setShowForm(open);
            if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-emerald-500 hover:bg-emerald-600" data-testid="create-invoice-btn">
              <Plus size={16} />
              <span>Nouvelle facture</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Créer une facture</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Client Info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Nom du client *</Label>
                  <Input
                    value={form.client_name}
                    onChange={(e) => setForm({...form, client_name: e.target.value})}
                    placeholder="Nom complet"
                    required
                  />
                </div>
                <div>
                  <Label>Téléphone Monity</Label>
                  <Input
                    value={form.client_phone}
                    onChange={(e) => setForm({...form, client_phone: e.target.value})}
                    placeholder="+243..."
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.client_email}
                    onChange={(e) => setForm({...form, client_email: e.target.value})}
                    placeholder="email@example.com"
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

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Articles</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus size={14} className="mr-1" /> Ajouter
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        {products.length > 0 ? (
                          <Select onValueChange={(v) => selectProduct(i, v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Produit ou description" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} - {p.price} {p.currency}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(i, 'description', e.target.value)}
                            placeholder="Description"
                          />
                        )}
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                          placeholder="Qté"
                          min="1"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                          placeholder="Prix"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          value={item.tax_rate}
                          onChange={(e) => updateItem(i, 'tax_rate', e.target.value)}
                          placeholder="TVA %"
                        />
                      </div>
                      <div className="col-span-1">
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeItem(i)}
                          disabled={form.items.length === 1}
                        >
                          <Trash2 size={14} className="text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Sous-total</span>
                  <span>{totals.subtotal.toFixed(2)} {form.currency}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>TVA</span>
                  <span>{totals.tax.toFixed(2)} {form.currency}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Remise</span>
                  <Input
                    type="number"
                    value={form.discount_amount}
                    onChange={(e) => setForm({...form, discount_amount: e.target.value})}
                    className="w-20 h-8"
                  />
                  <Select value={form.discount_type} onValueChange={(v) => setForm({...form, discount_type: v})}>
                    <SelectTrigger className="w-24 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">{form.currency}</SelectItem>
                      <SelectItem value="percentage">%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                  <span>Total</span>
                  <span className="text-emerald-500">{totals.total.toFixed(2)} {form.currency}</span>
                </div>
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Date d'échéance</Label>
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({...form, due_date: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={form.notes}
                    onChange={(e) => setForm({...form, notes: e.target.value})}
                    placeholder="Notes pour le client"
                  />
                </div>
              </div>
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Annuler</Button>
                </DialogClose>
                <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600">
                  Créer la facture
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par client ou numéro..."
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter size={16} className="mr-2" />
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Invoices Table */}
      {filtered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Facture</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="hidden sm:table-cell">Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const status = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
                  const StatusIcon = status.icon;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div>
                          <p className="font-medium">{inv.client_name}</p>
                          {inv.client_phone && (
                            <p className="text-xs text-muted-foreground">{inv.client_phone}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">
                        {inv.total} {inv.currency}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={status.color} className="gap-1">
                          <StatusIcon size={12} />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString('fr-FR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {inv.status === 'draft' && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSend(inv.id)} title="Envoyer">
                                <Send size={14} className="text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(inv.id)} title="Supprimer">
                                <Trash2 size={14} className="text-destructive" />
                              </Button>
                            </>
                          )}
                          {['sent', 'viewed', 'partial'].includes(inv.status) && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleCancel(inv.id)} title="Annuler">
                              <Ban size={14} className="text-amber-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleExportPDF(inv.id)} title="Télécharger PDF">
                            <FileDown size={14} className="text-emerald-500" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedInvoice(inv)} title="Voir">
                            <Eye size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto mb-3 text-muted-foreground" size={48} />
            <h3 className="text-lg font-semibold text-foreground">Aucune facture</h3>
            <p className="text-muted-foreground mt-1">
              {search || statusFilter !== 'all' 
                ? 'Aucune facture ne correspond à votre recherche' 
                : 'Créez votre première facture'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Invoice Detail Modal */}
      <Dialog open={!!selectedInvoice} onOpenChange={() => setSelectedInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Facture {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Client</p>
                  <p className="font-medium">{selectedInvoice.client_name}</p>
                  {selectedInvoice.client_phone && <p className="text-sm">{selectedInvoice.client_phone}</p>}
                </div>
                <Badge variant={STATUS_CONFIG[selectedInvoice.status]?.color}>
                  {STATUS_CONFIG[selectedInvoice.status]?.label}
                </Badge>
              </div>
              
              <div className="border rounded-lg divide-y">
                {selectedInvoice.items?.map((item, i) => (
                  <div key={i} className="p-3 flex justify-between">
                    <div>
                      <p className="font-medium">{item.description}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.quantity} x {item.unit_price} {selectedInvoice.currency}
                      </p>
                    </div>
                    <p className="font-semibold">{item.total} {selectedInvoice.currency}</p>
                  </div>
                ))}
              </div>
              
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Sous-total</span>
                  <span>{selectedInvoice.subtotal} {selectedInvoice.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span>TVA</span>
                  <span>{selectedInvoice.tax_total} {selectedInvoice.currency}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span>Remise</span>
                    <span>-{selectedInvoice.discount_amount} {selectedInvoice.currency}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>{selectedInvoice.total} {selectedInvoice.currency}</span>
                </div>
                {selectedInvoice.amount_paid > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span>Payé</span>
                    <span>{selectedInvoice.amount_paid} {selectedInvoice.currency}</span>
                  </div>
                )}
              </div>
              
              {selectedInvoice.notes && (
                <div className="bg-secondary/30 rounded-lg p-3">
                  <p className="text-sm text-muted-foreground">Notes: {selectedInvoice.notes}</p>
                </div>
              )}
              
              {/* QR Code for payment */}
              {selectedInvoice.qr_code && selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'cancelled' && (
                <div className="flex flex-col items-center p-4 bg-white rounded-lg border border-border" data-testid="invoice-qr-code">
                  <p className="text-sm font-medium text-gray-700 mb-2">Scanner pour payer</p>
                  <img 
                    src={`data:image/png;base64,${selectedInvoice.qr_code}`} 
                    alt="QR Code de paiement"
                    className="w-40 h-40"
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    {selectedInvoice.invoice_number}
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 gap-2"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `data:image/png;base64,${selectedInvoice.qr_code}`;
                      link.download = `qr-${selectedInvoice.invoice_number}.png`;
                      link.click();
                    }}
                  >
                    <Download size={14} />
                    Télécharger QR
                  </Button>
                </div>
              )}
              
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Créée le {new Date(selectedInvoice.created_at).toLocaleDateString('fr-FR')}</span>
                {selectedInvoice.due_date && (
                  <span>Échéance: {new Date(selectedInvoice.due_date).toLocaleDateString('fr-FR')}</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
