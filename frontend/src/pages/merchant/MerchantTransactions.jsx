import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Search, Filter, Receipt, ShoppingCart, FileText, CreditCard, FileDown, FileSpreadsheet } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
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

const TYPE_CONFIG = {
  pos: { label: 'Vente POS', icon: ShoppingCart, color: 'emerald' },
  invoice_payment: { label: 'Paiement facture', icon: FileText, color: 'blue' }
};

const PAYMENT_CONFIG = {
  cash: { label: 'Espèces', color: 'amber' },
  monity: { label: 'Monity', color: 'emerald' },
  card: { label: 'Carte', color: 'blue' }
};

export default function MerchantTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page, limit: 20 });
      if (typeFilter !== 'all') params.append('tx_type', typeFilter);
      
      const res = await API.get(`${MERCHANT_API}/transactions?${params}`);
      setTransactions(res.data.transactions);
      setTotalPages(res.data.pages);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const filtered = transactions.filter(tx =>
    tx.client_phone?.includes(search) ||
    tx.invoice_number?.toLowerCase().includes(search.toLowerCase())
  );

  const handleExportCSV = async () => {
    try {
      const response = await API.get(`${MERCHANT_API}/transactions/export/csv`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'transactions.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Export CSV téléchargé');
    } catch (err) {
      toast.error('Erreur lors de l\'export');
    }
  };

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
          <h1 className="text-2xl font-bold text-foreground">Transactions</h1>
          <p className="text-muted-foreground">Historique de toutes vos ventes</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2" data-testid="export-transactions-btn">
              <FileDown size={16} />
              <span>Exporter</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleExportCSV}>
              <FileSpreadsheet size={16} className="mr-2" />
              Exporter en CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par téléphone ou facture..."
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter size={16} className="mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="pos">Ventes POS</SelectItem>
            <SelectItem value="invoice_payment">Paiements facture</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions Table */}
      {filtered.length > 0 ? (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden md:table-cell">Client</TableHead>
                    <TableHead>Montant</TableHead>
                    <TableHead className="hidden sm:table-cell">Paiement</TableHead>
                    <TableHead className="hidden lg:table-cell">Date</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => {
                    const type = TYPE_CONFIG[tx.type] || TYPE_CONFIG.pos;
                    const TypeIcon = type.icon;
                    const payment = PAYMENT_CONFIG[tx.payment_method] || PAYMENT_CONFIG.cash;
                    
                    return (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg bg-${type.color}-500/10 flex items-center justify-center`}>
                              <TypeIcon className={`text-${type.color}-500`} size={16} />
                            </div>
                            <span className="hidden sm:inline text-sm">{type.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {tx.client_phone || '-'}
                        </TableCell>
                        <TableCell className="font-semibold text-emerald-500">
                          +{tx.total || tx.amount} {tx.currency}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className={`text-${payment.color}-500 border-${payment.color}-500/30`}>
                            {payment.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {new Date(tx.created_at).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tx.status === 'completed' ? 'default' : 'outline'} className={tx.status === 'completed' ? 'bg-emerald-500' : ''}>
                            {tx.status === 'completed' ? 'Complété' : 'En attente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >
                Précédent
              </Button>
              <span className="flex items-center px-3 text-sm text-muted-foreground">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="mx-auto mb-3 text-muted-foreground" size={48} />
            <h3 className="text-lg font-semibold text-foreground">Aucune transaction</h3>
            <p className="text-muted-foreground mt-1">
              {search || typeFilter !== 'all' 
                ? 'Aucune transaction trouvée' 
                : 'Vos ventes apparaîtront ici'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
