import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import API from '../utils/api';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowUpRight, ArrowDownLeft, Search, Filter, ChevronLeft, ChevronRight, X } from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC' };

function TxBadge({ status }) {
  const map = { completed: 'badge-completed', pending: 'badge-pending', rejected: 'badge-rejected' };
  const labels = { completed: 'Complété', pending: 'En attente', rejected: 'Rejeté' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-secondary text-foreground'}`}>{labels[status] || status}</span>;
}

function TypeBadge({ type }) {
  const map = {
    transfer: { label: 'Transfert', cls: 'bg-blue-500/10 text-blue-400' },
    recharge: { label: 'Rechargement', cls: 'bg-green-500/10 text-green-400' },
    withdrawal: { label: 'Retrait', cls: 'bg-orange-500/10 text-orange-400' },
    payment: { label: 'Paiement', cls: 'bg-purple-500/10 text-purple-400' },
  };
  const { label, cls } = map[type] || { label: type, cls: 'bg-secondary text-muted-foreground' };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

export default function TransactionHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [filters, setFilters] = useState({ status: '', type: '', search: '' });
  const [selected, setSelected] = useState(null);
  const LIMIT = 15;

  const fetchTxs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get(`/wallet/transactions?page=${page}&limit=${LIMIT}`);
      let txs = res.data.transactions || [];
      // Client-side filter for search
      if (filters.search) {
        const s = filters.search.toLowerCase();
        txs = txs.filter(t => (t.receiver_name || '').toLowerCase().includes(s) || (t.sender_name || '').toLowerCase().includes(s) || (t.description || '').toLowerCase().includes(s));
      }
      if (filters.status) txs = txs.filter(t => t.status === filters.status);
      if (filters.type) txs = txs.filter(t => t.type === filters.type);
      setTransactions(txs);
      setTotal(res.data.total);
      setPages(res.data.pages || 1);
    } catch (e) { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  const clearFilters = () => setFilters({ status: '', type: '', search: '' });

  const hasFilters = filters.status || filters.type || filters.search;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>Historique des transactions</h2>
        <span className="text-sm text-muted-foreground">{total} transactions</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 animate-fade-in-up stagger-1">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} placeholder="Rechercher..." className="pl-9 h-9 text-sm" data-testid="history-search-input" />
        </div>
        <Select value={filters.status || 'all'} onValueChange={v => setFilters({...filters, status: v === 'all' ? '' : v})}>
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="history-status-filter"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="completed">Complété</SelectItem>
            <SelectItem value="pending">En attente</SelectItem>
            <SelectItem value="rejected">Rejeté</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.type || 'all'} onValueChange={v => setFilters({...filters, type: v === 'all' ? '' : v})}>
          <SelectTrigger className="w-36 h-9 text-sm" data-testid="history-type-filter"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous types</SelectItem>
            <SelectItem value="transfer">Transfert</SelectItem>
            <SelectItem value="recharge">Rechargement</SelectItem>
            <SelectItem value="withdrawal">Retrait</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground">
            <X size={14} className="mr-1" /> Effacer
          </Button>
        )}
      </div>

      {/* Transaction List */}
      <div className="animate-fade-in-up stagger-2">
        {loading ? (
          <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-16 w-full rounded-lg" />)}</div>
        ) : transactions.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Filter size={32} className="text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-muted-foreground">Aucune transaction trouvée</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {transactions.map((tx, i) => {
              const isSender = tx.sender_id === user?.id;
              const name = tx.type === 'recharge' ? 'Rechargement' : isSender ? tx.receiver_name : tx.sender_name;
              const sign = tx.type === 'recharge' ? '+' : isSender ? '-' : '+';
              const amtColor = sign === '+' ? 'text-green-400' : 'text-foreground';
              return (
                <div key={tx.id}
                  className={`tx-item flex items-center gap-3 px-4 py-3.5 cursor-pointer ${i < transactions.length - 1 ? 'border-b border-border' : ''}`}
                  onClick={() => setSelected(tx)}
                  data-testid={`tx-row-${i}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${sign === '+' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                    {sign === '+' ? <ArrowDownLeft size={16} className="text-green-500" /> : <ArrowUpRight size={16} className="text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{name || '—'}</p>
                      <TypeBadge type={tx.type} />
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className={`text-sm font-bold ${amtColor}`}>{sign}{tx.amount} {tx.currency}</p>
                    <TxBadge status={tx.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>
            <ChevronLeft size={14} />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} sur {pages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page === pages}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}

      {/* Transaction Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="glass w-full max-w-sm rounded-2xl p-6 animate-fade-in-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground" style={{fontFamily:'Manrope'}}>Détails de la transaction</h3>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="text-center mb-4">
                <p className="text-3xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>{selected.amount} <span className="text-primary">{selected.currency}</span></p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <TypeBadge type={selected.type} />
                  <TxBadge status={selected.status} />
                </div>
              </div>
              {[
                ['ID', selected.id?.slice(-12) + '...'],
                ['Date', new Date(selected.created_at).toLocaleString('fr-FR')],
                ['Expéditeur', selected.sender_name || 'Système'],
                ['Destinataire', selected.receiver_name || 'Retrait'],
                ['Frais', `${selected.fee} ${selected.currency}`],
                ['Description', selected.description || '—'],
                selected.admin_note && ['Note admin', selected.admin_note],
              ].filter(Boolean).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border pb-2 last:border-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium text-right max-w-48 truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
