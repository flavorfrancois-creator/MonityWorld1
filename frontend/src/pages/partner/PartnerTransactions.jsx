import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Wallet, CreditCard, Users, RefreshCw } from 'lucide-react';

const TX_TYPES = {
  topup: { label: 'Rechargement', icon: Wallet, color: 'text-green-400', bg: 'bg-green-500/10' },
  client_recharge: { label: 'Recharge client', icon: ArrowDownRight, color: 'text-red-400', bg: 'bg-red-500/10' },
  client_withdraw: { label: 'Retrait client', icon: ArrowUpRight, color: 'text-green-400', bg: 'bg-green-500/10' },
  nfc_recharge: { label: 'Recharge NFC', icon: CreditCard, color: 'text-red-400', bg: 'bg-red-500/10' },
  nfc_withdraw: { label: 'Retrait NFC', icon: CreditCard, color: 'text-green-400', bg: 'bg-green-500/10' },
};

export default function PartnerTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');
  const LIMIT = 20;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/partner/transactions?page=${page}&limit=${LIMIT}`;
      if (typeFilter) url += `&tx_type=${typeFilter}`;
      const res = await API.get(url);
      setTransactions(res.data.transactions || []);
      setTotal(res.data.total || 0);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h1 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Historique des transactions
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{total} transaction{total > 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTransactions}>
          <RefreshCw size={14} className="mr-2" /> Actualiser
        </Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3 animate-fade-in-up stagger-1">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tous les types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tous les types</SelectItem>
            <SelectItem value="topup">Rechargements</SelectItem>
            <SelectItem value="client_recharge">Recharges client</SelectItem>
            <SelectItem value="client_withdraw">Retraits client</SelectItem>
            <SelectItem value="nfc_recharge">Recharges NFC</SelectItem>
            <SelectItem value="nfc_withdraw">Retraits NFC</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Transactions List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-up stagger-2">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Chargement...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Aucune transaction</div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map(tx => {
              const txType = TX_TYPES[tx.type] || { label: tx.type, icon: Wallet, color: 'text-foreground', bg: 'bg-secondary' };
              const Icon = txType.icon;
              const isCredit = tx.type === 'topup' || tx.type === 'client_withdraw' || tx.type === 'nfc_withdraw';
              
              return (
                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-secondary/20 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${txType.bg}`}>
                      <Icon size={18} className={txType.color} />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{txType.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.client_name || tx.card_name || tx.manager_name || '-'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                      {isCredit ? '+' : '-'}{tx.amount} {tx.currency}
                    </p>
                    {tx.commission > 0 && (
                      <p className="text-xs text-green-400">Commission: +{tx.commission}</p>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                      {tx.status}
                    </span>
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
    </div>
  );
}
