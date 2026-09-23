import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Search, Percent, DollarSign, Save, Globe, Users, CreditCard, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const TX_TYPE_CONFIG = {
  client_recharge: { label: 'Recharge client', icon: ArrowUpRight, color: 'text-green-400' },
  client_withdraw: { label: 'Retrait client', icon: ArrowDownRight, color: 'text-red-400' },
  nfc_recharge: { label: 'Recharge NFC', icon: CreditCard, color: 'text-blue-400' },
  nfc_withdraw: { label: 'Retrait NFC', icon: CreditCard, color: 'text-purple-400' }
};

export default function AdminPartnerRates() {
  const [countries, setCountries] = useState([]);
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [editRates, setEditRates] = useState({
    client_recharge_partner_commission: 2.0,
    client_recharge_client_fee: 1.0,
    client_withdraw_partner_commission: 2.0,
    client_withdraw_client_fee: 1.5,
    nfc_recharge_partner_commission: 1.5,
    nfc_recharge_client_fee: 0.5,
    nfc_withdraw_partner_commission: 1.5,
    nfc_withdraw_client_fee: 0.5
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('client_recharge');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [countriesRes, ratesRes] = await Promise.all([
        API.get('/admin/services/overview'),
        API.get('/admin/partner-rates')
      ]);
      setCountries(countriesRes.data.countries || []);
      
      const ratesObj = {};
      (ratesRes.data.rates || []).forEach(r => {
        ratesObj[r.country_code] = r;
      });
      setRates(ratesObj);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEditModal = (country) => {
    setSelectedCountry(country);
    const countryRates = rates[country.code] || {};
    setEditRates({
      client_recharge_partner_commission: countryRates.client_recharge_partner_commission ?? 2.0,
      client_recharge_client_fee: countryRates.client_recharge_client_fee ?? 1.0,
      client_withdraw_partner_commission: countryRates.client_withdraw_partner_commission ?? 2.0,
      client_withdraw_client_fee: countryRates.client_withdraw_client_fee ?? 1.5,
      nfc_recharge_partner_commission: countryRates.nfc_recharge_partner_commission ?? 1.5,
      nfc_recharge_client_fee: countryRates.nfc_recharge_client_fee ?? 0.5,
      nfc_withdraw_partner_commission: countryRates.nfc_withdraw_partner_commission ?? 1.5,
      nfc_withdraw_client_fee: countryRates.nfc_withdraw_client_fee ?? 0.5
    });
    setActiveTab('client_recharge');
  };

  const handleSave = async () => {
    if (!selectedCountry) return;
    setSaving(true);
    try {
      await API.put(`/admin/partner-rates/${selectedCountry.code}`, editRates);
      toast.success('Taux mis à jour');
      setRates(prev => ({
        ...prev,
        [selectedCountry.code]: { ...editRates, country_code: selectedCountry.code }
      }));
      setSelectedCountry(null);
    } catch (e) { 
      toast.error('Erreur'); 
    } finally { 
      setSaving(false); 
    }
  };

  const filteredCountries = search 
    ? countries.filter(c => 
        c.name.toLowerCase().includes(search.toLowerCase()) || 
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : countries;

  const getCountryRatesSummary = (countryCode) => {
    const r = rates[countryCode];
    if (!r) return { hasRates: false, avgCommission: 2.0, avgFee: 1.0 };
    const avgCommission = ((r.client_recharge_partner_commission || 2) + (r.client_withdraw_partner_commission || 2) + 
                          (r.nfc_recharge_partner_commission || 1.5) + (r.nfc_withdraw_partner_commission || 1.5)) / 4;
    const avgFee = ((r.client_recharge_client_fee || 1) + (r.client_withdraw_client_fee || 1.5) + 
                   (r.nfc_recharge_client_fee || 0.5) + (r.nfc_withdraw_client_fee || 0.5)) / 4;
    return { hasRates: true, avgCommission: avgCommission.toFixed(1), avgFee: avgFee.toFixed(1) };
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Taux Partenaires par Pays
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Définir les taux par type de transaction et par pays
          </p>
        </div>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          <Globe size={12} className="mr-1" /> {countries.length} pays
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-md animate-fade-in-up stagger-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          placeholder="Rechercher un pays..." 
          className="pl-9 h-9 text-sm" 
        />
      </div>

      {/* Countries Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden animate-fade-in-up stagger-2">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Pays</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Recharge Client</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Retrait Client</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Recharge NFC</th>
              <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Retrait NFC</th>
              <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Chargement...</td></tr>
            ) : filteredCountries.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">Aucun pays trouvé</td></tr>
            ) : filteredCountries.slice(0, 30).map(country => {
              const r = rates[country.code] || {};
              return (
                <tr key={country.code} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{country.flag}</span>
                      <div>
                        <p className="font-medium text-foreground text-sm">{country.name}</p>
                        <p className="text-xs text-muted-foreground">{country.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-xs">
                      <span className="text-green-400">{r.client_recharge_partner_commission ?? 2}%</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-blue-400">{r.client_recharge_client_fee ?? 1}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-xs">
                      <span className="text-green-400">{r.client_withdraw_partner_commission ?? 2}%</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-blue-400">{r.client_withdraw_client_fee ?? 1.5}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-xs">
                      <span className="text-green-400">{r.nfc_recharge_partner_commission ?? 1.5}%</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-blue-400">{r.nfc_recharge_client_fee ?? 0.5}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-xs">
                      <span className="text-green-400">{r.nfc_withdraw_partner_commission ?? 1.5}%</span>
                      <span className="text-muted-foreground mx-1">/</span>
                      <span className="text-blue-400">{r.nfc_withdraw_client_fee ?? 0.5}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => openEditModal(country)}
                      data-testid={`edit-rates-${country.code}`}
                    >
                      Modifier
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <p className="text-xs text-muted-foreground text-center">
        <span className="text-green-400">Vert</span> = Commission partenaire | <span className="text-blue-400">Bleu</span> = Frais client
      </p>

      {/* Edit Modal */}
      <Dialog open={!!selectedCountry} onOpenChange={() => setSelectedCountry(null)}>
        <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <span className="text-2xl">{selectedCountry?.flag}</span>
              Taux pour {selectedCountry?.name}
            </DialogTitle>
            <DialogDescription>
              Définir les taux par type de transaction
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid grid-cols-4 bg-secondary/30">
              {Object.entries(TX_TYPE_CONFIG).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <TabsTrigger key={key} value={key} className="text-xs px-2">
                    <Icon size={12} className={`mr-1 ${config.color}`} />
                    <span className="hidden sm:inline">{config.label.split(' ')[0]}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {Object.entries(TX_TYPE_CONFIG).map(([txType, config]) => (
              <TabsContent key={txType} value={txType} className="mt-4 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  {(() => { const Icon = config.icon; return <Icon size={18} className={config.color} />; })()}
                  <span className="font-medium">{config.label}</span>
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                    <Percent size={14} className="text-green-400" />
                    Commission Partenaire (%)
                  </label>
                  <Input 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="20"
                    value={editRates[`${txType}_partner_commission`]}
                    onChange={e => setEditRates({...editRates, [`${txType}_partner_commission`]: parseFloat(e.target.value) || 0})}
                  />
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                    <DollarSign size={14} className="text-blue-400" />
                    Frais Client (%)
                  </label>
                  <Input 
                    type="number" 
                    step="0.1"
                    min="0"
                    max="20"
                    value={editRates[`${txType}_client_fee`]}
                    onChange={e => setEditRates({...editRates, [`${txType}_client_fee`]: parseFloat(e.target.value) || 0})}
                  />
                </div>

                {/* Preview */}
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-sm font-medium text-foreground mb-2">Exemple pour 100$</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Commission partenaire</span>
                      <span className="text-green-400">+${(100 * editRates[`${txType}_partner_commission`] / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frais client</span>
                      <span className="text-red-400">-${(100 * editRates[`${txType}_client_fee`] / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1" onClick={() => setSelectedCountry(null)}>
              Annuler
            </Button>
            <Button className="flex-1 btn-primary-glow" onClick={handleSave} disabled={saving} data-testid="save-rates-btn">
              <Save size={14} className="mr-2" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
