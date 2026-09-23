import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { 
  Settings, Plus, Edit, Trash2, Globe, ArrowRight, Percent, 
  DollarSign, Clock, AlertTriangle, Check, Filter
} from 'lucide-react';

const COUNTRIES = [
  { code: 'ALL', name: '🌍 Global (Tous pays)' },
  { code: 'CD', name: '🇨🇩 RD Congo' }, { code: 'CM', name: '🇨🇲 Cameroun' },
  { code: 'SN', name: '🇸🇳 Sénégal' }, { code: 'CI', name: '🇨🇮 Côte d\'Ivoire' },
  { code: 'NG', name: '🇳🇬 Nigeria' }, { code: 'GH', name: '🇬🇭 Ghana' },
  { code: 'FR', name: '🇫🇷 France' }, { code: 'BE', name: '🇧🇪 Belgique' },
  { code: 'US', name: '🇺🇸 États-Unis' }, { code: 'CN', name: '🇨🇳 Chine' },
];

const TX_TYPES = [
  { value: 'transfer', label: 'Transfert' },
  { value: 'withdrawal', label: 'Retrait' },
  { value: 'recharge', label: 'Rechargement' },
];

const PROCESSING_TIMES = [
  { value: 'instant', label: 'Instantané' },
  { value: '1-3_hours', label: '1-3 heures' },
  { value: '1-3_days', label: '1-3 jours' },
  { value: '3-5_days', label: '3-5 jours' },
];

export default function AdminTransactionRules() {
  const [rules, setRules] = useState([]);
  const [intlRules, setIntlRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('national');
  
  // Filters
  const [countryFilter, setCountryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  
  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [form, setForm] = useState({
    country_code: 'ALL',
    transaction_type: 'transfer',
    fee_type: 'percentage',
    fee_value: 1.0,
    min_fee: 0,
    max_fee: null,
    daily_limit: 10000,
    monthly_limit: 100000,
    per_transaction_min: 1,
    per_transaction_max: 5000,
    is_active: true,
    // International specific
    source_country: 'CD',
    destination_country: 'CM',
    exchange_rate_margin: 2.0,
    processing_time: 'instant'
  });

  const fetchRules = useCallback(async () => {
    try {
      const [rulesRes, intlRes] = await Promise.all([
        API.get('/admin/transaction-rules', { params: { country: countryFilter, tx_type: typeFilter } }),
        API.get('/admin/international-rules')
      ]);
      setRules(rulesRes.data.rules || []);
      setIntlRules(intlRes.data.rules || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [countryFilter, typeFilter]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreateModal = (isIntl = false) => {
    setEditingRule(null);
    setForm({
      country_code: 'ALL',
      transaction_type: 'transfer',
      fee_type: 'percentage',
      fee_value: isIntl ? 2.5 : 1.0,
      min_fee: isIntl ? 1.0 : 0,
      max_fee: null,
      daily_limit: isIntl ? 5000 : 10000,
      monthly_limit: isIntl ? 50000 : 100000,
      per_transaction_min: isIntl ? 10 : 1,
      per_transaction_max: isIntl ? 2000 : 5000,
      is_active: true,
      source_country: 'CD',
      destination_country: 'CM',
      exchange_rate_margin: 2.0,
      processing_time: 'instant'
    });
    setShowModal(true);
  };

  const openEditModal = (rule, isIntl = false) => {
    setEditingRule({ ...rule, isIntl });
    setForm({
      ...rule,
      max_fee: rule.max_fee || null
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const isIntl = activeTab === 'international' || editingRule?.isIntl;
      const endpoint = isIntl ? '/admin/international-rules' : '/admin/transaction-rules';
      
      if (editingRule) {
        await API.put(`${endpoint}/${editingRule.id}`, form);
        toast.success('Règle mise à jour');
      } else {
        await API.post(endpoint, form);
        toast.success('Règle créée');
      }
      setShowModal(false);
      fetchRules();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (ruleId, isIntl = false) => {
    if (!window.confirm('Supprimer cette règle ?')) return;
    try {
      const endpoint = isIntl ? '/admin/international-rules' : '/admin/transaction-rules';
      await API.delete(`${endpoint}/${ruleId}`);
      toast.success('Règle supprimée');
      fetchRules();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const getCountryName = (code) => COUNTRIES.find(c => c.code === code)?.name || code;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Manrope' }}>
            Règles de Transaction
          </h1>
          <p className="text-sm text-muted-foreground">
            Gérez les frais et limites par pays et type de transaction
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="national" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings size={14} className="mr-2" />
            Règles Nationales
          </TabsTrigger>
          <TabsTrigger value="international" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Globe size={14} className="mr-2" />
            Règles Internationales
          </TabsTrigger>
        </TabsList>

        {/* National Rules */}
        <TabsContent value="national" className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-muted-foreground" />
              <Select value={countryFilter || "all"} onValueChange={v => setCountryFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Tous pays" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous pays</SelectItem>
                  {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={typeFilter || "all"} onValueChange={v => setTypeFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Tous types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  {TX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1" />
            <Button onClick={() => openCreateModal(false)} data-testid="create-rule-btn">
              <Plus size={16} className="mr-2" />
              Nouvelle règle
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Pays</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Frais</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Limites</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Statut</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={rule.id} className={`border-t border-border ${i % 2 === 0 ? '' : 'bg-secondary/20'}`}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{getCountryName(rule.country_code)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-foreground capitalize">{rule.transaction_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {rule.fee_type === 'percentage' ? <Percent size={14} className="text-primary" /> : <DollarSign size={14} className="text-primary" />}
                        <span className="font-semibold text-foreground">
                          {rule.fee_value}{rule.fee_type === 'percentage' ? '%' : ''}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Min: {rule.min_fee} {rule.max_fee ? `| Max: ${rule.max_fee}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>Par tx: {rule.per_transaction_min} - {rule.per_transaction_max}</p>
                      <p>Jour: {rule.daily_limit?.toLocaleString()} | Mois: {rule.monthly_limit?.toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rule.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                          <Check size={12} /> Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400">
                          <AlertTriangle size={12} /> Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditModal(rule)}>
                          <Edit size={14} />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(rule.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rules.length === 0 && (
              <div className="p-12 text-center">
                <Settings size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">Aucune règle nationale définie</p>
                <p className="text-xs text-muted-foreground mt-1">Les frais par défaut seront appliqués</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* International Rules */}
        <TabsContent value="international" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Définissez les frais et taux de change pour les transferts entre pays
            </p>
            <Button onClick={() => openCreateModal(true)} data-testid="create-intl-rule-btn">
              <Plus size={16} className="mr-2" />
              Nouveau corridor
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Corridor</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Frais</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Marge FX</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Limites</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Délai</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Statut</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {intlRules.map((rule, i) => (
                  <tr key={rule.id} className={`border-t border-border ${i % 2 === 0 ? '' : 'bg-secondary/20'}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{getCountryName(rule.source_country)}</span>
                        <ArrowRight size={14} className="text-muted-foreground" />
                        <span className="font-medium text-foreground">{getCountryName(rule.destination_country)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-foreground">
                        {rule.fee_value}{rule.fee_type === 'percentage' ? '%' : ''}
                      </span>
                      <p className="text-[10px] text-muted-foreground">
                        Min: {rule.min_fee} {rule.max_fee ? `| Max: ${rule.max_fee}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-yellow-400">{rule.exchange_rate_margin}%</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p>Par tx: {rule.per_transaction_min} - {rule.per_transaction_max}</p>
                      <p>Jour: {rule.daily_limit?.toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-foreground flex items-center gap-1">
                        <Clock size={12} />
                        {PROCESSING_TIMES.find(t => t.value === rule.processing_time)?.label || rule.processing_time}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rule.is_active ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">
                          <Check size={12} /> Actif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditModal(rule, true)}>
                          <Edit size={14} />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(rule.id, true)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {intlRules.length === 0 && (
              <div className="p-12 text-center">
                <Globe size={40} className="mx-auto text-muted-foreground mb-3 opacity-50" />
                <p className="text-muted-foreground">Aucun corridor international défini</p>
                <p className="text-xs text-muted-foreground mt-1">Les frais par défaut (2.5%) seront appliqués</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Manrope' }} className="flex items-center gap-2">
              {editingRule ? <Edit size={18} className="text-primary" /> : <Plus size={18} className="text-primary" />}
              {editingRule ? 'Modifier la règle' : 'Nouvelle règle'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Country/Corridor selection */}
            {activeTab === 'national' && !editingRule?.isIntl ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Pays</Label>
                  <Select value={form.country_code} onValueChange={v => setForm({...form, country_code: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Type de transaction</Label>
                  <Select value={form.transaction_type} onValueChange={v => setForm({...form, transaction_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Pays source</Label>
                  <Select value={form.source_country} onValueChange={v => setForm({...form, source_country: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pays destination</Label>
                  <Select value={form.destination_country} onValueChange={v => setForm({...form, destination_country: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Fee configuration */}
            <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Configuration des frais</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type de frais</Label>
                  <Select value={form.fee_type} onValueChange={v => setForm({...form, fee_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Pourcentage (%)</SelectItem>
                      <SelectItem value="fixed">Montant fixe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Valeur</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.fee_value}
                    onChange={e => setForm({...form, fee_value: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Frais minimum</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.min_fee}
                    onChange={e => setForm({...form, min_fee: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Frais maximum (optionnel)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.max_fee || ''}
                    onChange={e => setForm({...form, max_fee: e.target.value ? parseFloat(e.target.value) : null})}
                    placeholder="Aucun"
                  />
                </div>
              </div>
            </div>

            {/* International specific: Exchange rate margin */}
            {(activeTab === 'international' || editingRule?.isIntl) && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Marge taux de change (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.exchange_rate_margin}
                    onChange={e => setForm({...form, exchange_rate_margin: parseFloat(e.target.value) || 0})}
                  />
                  <p className="text-[10px] text-muted-foreground">Marge sur le taux de change réel</p>
                </div>
                <div className="space-y-2">
                  <Label>Délai de traitement</Label>
                  <Select value={form.processing_time} onValueChange={v => setForm({...form, processing_time: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROCESSING_TIMES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Limits configuration */}
            <div className="bg-secondary/30 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Limites de transaction</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Minimum par transaction</Label>
                  <Input
                    type="number"
                    value={form.per_transaction_min}
                    onChange={e => setForm({...form, per_transaction_min: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Maximum par transaction</Label>
                  <Input
                    type="number"
                    value={form.per_transaction_max}
                    onChange={e => setForm({...form, per_transaction_max: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Limite journalière</Label>
                  <Input
                    type="number"
                    value={form.daily_limit}
                    onChange={e => setForm({...form, daily_limit: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Limite mensuelle</Label>
                  <Input
                    type="number"
                    value={form.monthly_limit}
                    onChange={e => setForm({...form, monthly_limit: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
              <div>
                <p className="text-sm font-medium text-foreground">Règle active</p>
                <p className="text-xs text-muted-foreground">Cette règle sera appliquée aux transactions</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm({...form, is_active: v})}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowModal(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement...' : (editingRule ? 'Mettre à jour' : 'Créer')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
