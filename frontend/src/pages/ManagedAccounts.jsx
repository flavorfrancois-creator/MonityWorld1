import { useState, useEffect, useCallback } from 'react';
import API from '../utils/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Users, Plus, Eye, History, Check, X, Trash2, 
  UserCheck, UserX, Shield, ChevronRight
} from 'lucide-react';

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', XAF: 'FCFA', XOF: 'FCFA', GBP: '£', CNY: '¥', CDF: 'FC', NGN: '₦', GHS: '₵', RUB: '₽', CAD: 'C$', MXN: '$' };

export default function ManagedAccounts() {
  const [managedAccounts, setManagedAccounts] = useState([]);
  const [managedBy, setManagedBy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetails, setShowDetails] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('managed'); // 'managed' | 'managers'
  
  // Form states
  const [phone, setPhone] = useState('');
  const [permissions, setPermissions] = useState(['view_balance', 'view_transactions']);

  const fetchData = useCallback(async () => {
    try {
      const [managedRes, managersRes] = await Promise.all([
        API.get('/managed-accounts'),
        API.get('/managed-by')
      ]);
      setManagedAccounts(managedRes.data || []);
      setManagedBy(managersRes.data || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addManagedAccount = async () => {
    if (!phone.trim()) {
      toast.error('Numéro de téléphone requis');
      return;
    }
    try {
      await API.post('/managed-accounts', {
        managed_user_phone: phone.trim(),
        permissions
      });
      toast.success('Demande envoyée !');
      setShowAdd(false);
      setPhone('');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const respondToRequest = async (requestId, action) => {
    try {
      await API.patch(`/managed-accounts/${requestId}`, null, {
        params: { action }
      });
      toast.success(action === 'accept' ? 'Demande acceptée' : 'Demande refusée');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const removeManagement = async (managementId) => {
    if (!window.confirm('Supprimer cette relation de gestion ?')) return;
    try {
      await API.delete(`/managed-accounts/${managementId}`);
      toast.success('Relation supprimée');
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const viewAccountDetails = async (managed) => {
    setShowDetails(managed);
    setDetailsLoading(true);
    try {
      const [balanceRes, txRes] = await Promise.all([
        managed.permissions.includes('view_balance') 
          ? API.get(`/managed-accounts/${managed.managed_user_id}/balance`)
          : Promise.resolve({ data: null }),
        managed.permissions.includes('view_transactions')
          ? API.get(`/managed-accounts/${managed.managed_user_id}/transactions?limit=10`)
          : Promise.resolve({ data: null })
      ]);
      setDetailsData({
        balance: balanceRes.data,
        transactions: txRes.data
      });
    } catch (e) {
      toast.error('Erreur de chargement des détails');
    } finally {
      setDetailsLoading(false);
    }
  };

  const togglePermission = (perm) => {
    if (permissions.includes(perm)) {
      setPermissions(permissions.filter(p => p !== perm));
    } else {
      setPermissions([...permissions, perm]);
    }
  };

  // Pending requests from others wanting to manage current user
  const pendingRequests = managedBy.filter(m => m.status === 'pending');

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>Gestion de Comptes</h1>
          <p className="text-sm text-muted-foreground">Contrôle parental et gestion managériale</p>
        </div>
        <Button onClick={() => setShowAdd(true)} data-testid="add-managed-btn">
          <Plus size={16} className="mr-2" />
          Ajouter
        </Button>
      </div>

      {/* Pending Requests Alert */}
      {pendingRequests.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 space-y-3" data-testid="pending-requests">
          <h3 className="font-semibold text-yellow-400 flex items-center gap-2">
            <Shield size={16} />
            Demandes en attente ({pendingRequests.length})
          </h3>
          {pendingRequests.map(req => (
            <div key={req.id} className="flex items-center justify-between bg-background/50 rounded-lg p-3">
              <div>
                <p className="font-medium text-foreground">{req.manager?.name || req.manager_name}</p>
                <p className="text-xs text-muted-foreground">Veut gérer votre compte</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => respondToRequest(req.id, 'reject')} className="text-red-400">
                  <X size={14} />
                </Button>
                <Button size="sm" onClick={() => respondToRequest(req.id, 'accept')}>
                  <Check size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Managed Account Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md animate-fade-in-up" data-testid="add-managed-modal">
            <h3 className="text-lg font-semibold text-foreground mb-4">Ajouter un compte à gérer</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">Numéro de téléphone</label>
                <Input
                  placeholder="+243..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1"
                  data-testid="managed-phone"
                />
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Permissions demandées</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.includes('view_balance')}
                      onChange={() => togglePermission('view_balance')}
                      className="rounded"
                    />
                    <Eye size={14} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">Voir le solde</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={permissions.includes('view_transactions')}
                      onChange={() => togglePermission('view_transactions')}
                      className="rounded"
                    />
                    <History size={14} className="text-muted-foreground" />
                    <span className="text-sm text-foreground">Voir les transactions</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="ghost" className="flex-1" onClick={() => setShowAdd(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={addManagedAccount} data-testid="confirm-add-managed">
                Envoyer la demande
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Account Details Modal */}
      {showDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg animate-fade-in-up my-8" data-testid="account-details-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {showDetails.managed_user?.name || showDetails.managed_user_name}
              </h3>
              <button onClick={() => { setShowDetails(null); setDetailsData(null); }} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {detailsLoading ? (
              <div className="space-y-3">
                <div className="skeleton h-20 w-full rounded-lg" />
                <div className="skeleton h-40 w-full rounded-lg" />
              </div>
            ) : detailsData ? (
              <div className="space-y-4">
                {/* Balance */}
                {detailsData.balance && (
                  <div className="bg-secondary/50 rounded-xl p-4">
                    <h4 className="text-sm text-muted-foreground mb-2">Solde total</h4>
                    <p className="text-2xl font-bold text-primary" style={{ fontFamily: 'Manrope' }}>
                      ${detailsData.balance.total_usd?.toFixed(2)}
                    </p>
                    <div className="mt-3 space-y-1">
                      {detailsData.balance.wallets?.map(w => (
                        <div key={w.id} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{w.currency}</span>
                          <span className="text-foreground">{CURRENCY_SYMBOLS[w.currency]}{w.balance.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transactions */}
                {detailsData.transactions && (
                  <div>
                    <h4 className="text-sm text-muted-foreground mb-2">Dernières transactions</h4>
                    <div className="bg-secondary/50 rounded-xl overflow-hidden">
                      {detailsData.transactions.transactions?.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-4 text-center">Aucune transaction</p>
                      ) : (
                        detailsData.transactions.transactions?.slice(0, 5).map((tx, i) => (
                          <div key={tx.id} className={`flex items-center justify-between p-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                            <div>
                              <p className="text-sm text-foreground">{tx.description || tx.type}</p>
                              <p className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <p className={`text-sm font-semibold ${tx.type === 'recharge' ? 'text-green-400' : ''}`}>
                              {tx.type === 'recharge' ? '+' : '-'}{CURRENCY_SYMBOLS[tx.currency]}{tx.amount}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Aucune donnée disponible</p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-secondary/50 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('managed')}
          className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'managed' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <UserCheck size={14} className="inline mr-2" />
          Comptes gérés ({managedAccounts.length})
        </button>
        <button
          onClick={() => setActiveTab('managers')}
          className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'managers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <UserX size={14} className="inline mr-2" />
          Mes gestionnaires ({managedBy.filter(m => m.status === 'active').length})
        </button>
      </div>

      {/* Managed Accounts List */}
      {activeTab === 'managed' && (
        <div className="space-y-3" data-testid="managed-accounts-list">
          {managedAccounts.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Users size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="font-semibold text-foreground">Aucun compte géré</h3>
              <p className="text-sm text-muted-foreground mt-1">Ajoutez des comptes pour les superviser</p>
            </div>
          ) : (
            managedAccounts.map(managed => (
              <div 
                key={managed.id} 
                className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors"
                data-testid={`managed-account-${managed.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users size={18} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{managed.managed_user?.name || managed.managed_user_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {managed.status === 'pending' ? 'En attente de réponse' : 'Actif'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {managed.status === 'active' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => viewAccountDetails(managed)}
                      >
                        <Eye size={14} className="mr-1" />
                        Voir
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeManagement(managed.id)}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
                
                {/* Permissions */}
                <div className="flex gap-2 mt-3">
                  {managed.permissions?.map(perm => (
                    <span key={perm} className="text-xs bg-secondary px-2 py-1 rounded-md text-muted-foreground">
                      {perm === 'view_balance' ? 'Solde' : perm === 'view_transactions' ? 'Transactions' : perm}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Managers List */}
      {activeTab === 'managers' && (
        <div className="space-y-3" data-testid="managers-list">
          {managedBy.filter(m => m.status === 'active').length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Shield size={48} className="mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="font-semibold text-foreground">Aucun gestionnaire</h3>
              <p className="text-sm text-muted-foreground mt-1">Personne ne gère votre compte actuellement</p>
            </div>
          ) : (
            managedBy.filter(m => m.status === 'active').map(manager => (
              <div 
                key={manager.id} 
                className="bg-card border border-border rounded-xl p-4"
                data-testid={`manager-${manager.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Shield size={18} className="text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{manager.manager?.name || manager.manager_name}</h3>
                      <p className="text-xs text-muted-foreground">Gestionnaire actif</p>
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeManagement(manager.id)}
                    className="text-muted-foreground hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
                
                {/* Permissions */}
                <div className="flex gap-2 mt-3">
                  {manager.permissions?.map(perm => (
                    <span key={perm} className="text-xs bg-secondary px-2 py-1 rounded-md text-muted-foreground">
                      {perm === 'view_balance' ? 'Voir solde' : perm === 'view_transactions' ? 'Voir transactions' : perm}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
