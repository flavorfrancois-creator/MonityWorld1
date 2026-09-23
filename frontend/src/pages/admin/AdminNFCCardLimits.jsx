import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Search, CreditCard, Save, Globe, DollarSign, Calendar, Wallet } from 'lucide-react';

const CARD_TYPES = {
  basic: { name: 'Basique', color: 'bg-gray-500', textColor: 'text-gray-400' },
  standard: { name: 'Standard', color: 'bg-blue-500', textColor: 'text-blue-400' },
  premium: { name: 'Premium', color: 'bg-yellow-500', textColor: 'text-yellow-400' }
};

const CURRENCIES = ['USD', 'EUR', 'XAF', 'XOF', 'CDF', 'NGN', 'KES', 'ZAR', 'GBP'];

export default function AdminNFCCardLimits() {
  const [countries, setCountries] = useState([]);
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [editLimits, setEditLimits] = useState({
    basic: { daily_limit: 100, weekly_limit: 500, monthly_limit: 1500, max_balance: 500, min_recharge: 1, max_recharge: 100 },
    standard: { daily_limit: 500, weekly_limit: 2000, monthly_limit: 5000, max_balance: 2000, min_recharge: 1, max_recharge: 500 },
    premium: { daily_limit: 2000, weekly_limit: 10000, monthly_limit: 30000, max_balance: 10000, min_recharge: 1, max_recharge: 2000 }
  });
  const [saving, setSaving] = useState(false);
  const [activeCardType, setActiveCardType] = useState('basic');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [countriesRes, limitsRes] = await Promise.all([
        API.get('/admin/services/overview'),
        API.get('/admin/nfc-card-limits')
      ]);
      setCountries(countriesRes.data.countries || []);
      
      // Convert limits to nested object
      const limitsObj = {};
      (limitsRes.data.limits || []).forEach(l => {
        const key = `${l.country_code}_${l.currency}`;
        if (!limitsObj[key]) limitsObj[key] = {};
        limitsObj[key][l.card_type] = l;
      });
      setLimits(limitsObj);
    } catch (e) { 
      toast.error('Erreur de chargement'); 
    } finally { 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEditModal = async (country) => {
    setSelectedCountry(country);
    setSelectedCurrency('USD');
    setActiveCardType('basic');
    
    try {
      const res = await API.get(`/admin/nfc-card-limits/${country.code}?currency=USD`);
      const limitsData = {};
      (res.data.limits || []).forEach(l => {
        limitsData[l.card_type] = {
          daily_limit: l.daily_limit,
          weekly_limit: l.weekly_limit,
          monthly_limit: l.monthly_limit,
          max_balance: l.max_balance,
          min_recharge: l.min_recharge,
          max_recharge: l.max_recharge
        };
      });
      
      // Fill in defaults for any missing card types
      if (!limitsData.basic) limitsData.basic = { daily_limit: 100, weekly_limit: 500, monthly_limit: 1500, max_balance: 500, min_recharge: 1, max_recharge: 100 };
      if (!limitsData.standard) limitsData.standard = { daily_limit: 500, weekly_limit: 2000, monthly_limit: 5000, max_balance: 2000, min_recharge: 1, max_recharge: 500 };
      if (!limitsData.premium) limitsData.premium = { daily_limit: 2000, weekly_limit: 10000, monthly_limit: 30000, max_balance: 10000, min_recharge: 1, max_recharge: 2000 };
      
      setEditLimits(limitsData);
    } catch (e) {
      // Use defaults
      setEditLimits({
        basic: { daily_limit: 100, weekly_limit: 500, monthly_limit: 1500, max_balance: 500, min_recharge: 1, max_recharge: 100 },
        standard: { daily_limit: 500, weekly_limit: 2000, monthly_limit: 5000, max_balance: 2000, min_recharge: 1, max_recharge: 500 },
        premium: { daily_limit: 2000, weekly_limit: 10000, monthly_limit: 30000, max_balance: 10000, min_recharge: 1, max_recharge: 2000 }
      });
    }
  };

  const loadLimitsForCurrency = async (currency) => {
    if (!selectedCountry) return;
    setSelectedCurrency(currency);
    
    try {
      const res = await API.get(`/admin/nfc-card-limits/${selectedCountry.code}?currency=${currency}`);
      const limitsData = {};
      (res.data.limits || []).forEach(l => {
        limitsData[l.card_type] = {
          daily_limit: l.daily_limit,
          weekly_limit: l.weekly_limit,
          monthly_limit: l.monthly_limit,
          max_balance: l.max_balance,
          min_recharge: l.min_recharge,
          max_recharge: l.max_recharge
        };
      });
      
      if (!limitsData.basic) limitsData.basic = { daily_limit: 100, weekly_limit: 500, monthly_limit: 1500, max_balance: 500, min_recharge: 1, max_recharge: 100 };
      if (!limitsData.standard) limitsData.standard = { daily_limit: 500, weekly_limit: 2000, monthly_limit: 5000, max_balance: 2000, min_recharge: 1, max_recharge: 500 };
      if (!limitsData.premium) limitsData.premium = { daily_limit: 2000, weekly_limit: 10000, monthly_limit: 30000, max_balance: 10000, min_recharge: 1, max_recharge: 2000 };
      
      setEditLimits(limitsData);
    } catch (e) {
      toast.error('Erreur de chargement');
    }
  };

  const handleSave = async () => {
    if (!selectedCountry) return;
    setSaving(true);
    try {
      // Save limits for each card type
      for (const cardType of Object.keys(CARD_TYPES)) {
        await API.put(`/admin/nfc-card-limits/${selectedCountry.code}`, {
          card_type: cardType,
          currency: selectedCurrency,
          ...editLimits[cardType]
        });
      }
      toast.success('Limites mises à jour');
      fetchData();
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

  const updateLimit = (cardType, field, value) => {
    setEditLimits(prev => ({
      ...prev,
      [cardType]: {
        ...prev[cardType],
        [field]: parseFloat(value) || 0
      }
    }));
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
            Limites Cartes NFC Standalone
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configurer les limites par type de carte, pays et devise
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(CARD_TYPES).map(([key, config]) => (
            <Badge key={key} variant="outline" className={`${config.textColor} border-current/20`}>
              <CreditCard size={10} className="mr-1" /> {config.name}
            </Badge>
          ))}
        </div>
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

      {/* Countries Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 animate-fade-in-up stagger-2">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Chargement...</div>
        ) : filteredCountries.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">Aucun pays trouvé</div>
        ) : filteredCountries.slice(0, 24).map(country => (
          <div 
            key={country.code}
            onClick={() => openEditModal(country)}
            className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-all group"
            data-testid={`country-nfc-${country.code}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{country.flag}</span>
                <div>
                  <p className="font-medium text-foreground text-sm">{country.name}</p>
                  <p className="text-xs text-muted-foreground">{country.code}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-1">
              {Object.entries(CARD_TYPES).map(([key, config]) => (
                <div key={key} className={`flex-1 h-1.5 rounded-full ${config.color}/30`}>
                  <div className={`h-full rounded-full ${config.color}`} style={{width: '100%'}} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center group-hover:text-primary transition-colors">
              Cliquer pour configurer
            </p>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      <Dialog open={!!selectedCountry} onOpenChange={() => setSelectedCountry(null)}>
        <DialogContent className="bg-card border-border sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <span className="text-2xl">{selectedCountry?.flag}</span>
              Limites NFC - {selectedCountry?.name}
            </DialogTitle>
            <DialogDescription>
              Configurer les limites par type de carte et devise
            </DialogDescription>
          </DialogHeader>
          
          {/* Currency Selector */}
          <div className="flex items-center gap-3 mt-4">
            <label className="text-sm font-medium text-foreground">Devise:</label>
            <Select value={selectedCurrency} onValueChange={loadLimitsForCurrency}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Card Type Tabs */}
          <Tabs value={activeCardType} onValueChange={setActiveCardType} className="mt-4">
            <TabsList className="grid grid-cols-3 bg-secondary/30">
              {Object.entries(CARD_TYPES).map(([key, config]) => (
                <TabsTrigger key={key} value={key} className={`${config.textColor}`}>
                  <CreditCard size={14} className="mr-2" />
                  {config.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(CARD_TYPES).map(([cardType, config]) => (
              <TabsContent key={cardType} value={cardType} className="mt-4 space-y-4">
                <div className={`p-3 rounded-lg ${config.color}/10 border border-current/20 ${config.textColor}`}>
                  <p className="text-sm font-medium">Carte {config.name}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar size={12} /> Limite journalière
                    </label>
                    <Input 
                      type="number" 
                      value={editLimits[cardType]?.daily_limit || 0}
                      onChange={e => updateLimit(cardType, 'daily_limit', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar size={12} /> Limite hebdomadaire
                    </label>
                    <Input 
                      type="number" 
                      value={editLimits[cardType]?.weekly_limit || 0}
                      onChange={e => updateLimit(cardType, 'weekly_limit', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar size={12} /> Limite mensuelle
                    </label>
                    <Input 
                      type="number" 
                      value={editLimits[cardType]?.monthly_limit || 0}
                      onChange={e => updateLimit(cardType, 'monthly_limit', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Wallet size={12} /> Solde maximum
                    </label>
                    <Input 
                      type="number" 
                      value={editLimits[cardType]?.max_balance || 0}
                      onChange={e => updateLimit(cardType, 'max_balance', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <DollarSign size={12} /> Recharge min
                    </label>
                    <Input 
                      type="number" 
                      value={editLimits[cardType]?.min_recharge || 0}
                      onChange={e => updateLimit(cardType, 'min_recharge', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <DollarSign size={12} /> Recharge max
                    </label>
                    <Input 
                      type="number" 
                      value={editLimits[cardType]?.max_recharge || 0}
                      onChange={e => updateLimit(cardType, 'max_recharge', e.target.value)}
                    />
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-secondary/30 rounded-xl p-4 mt-4">
                  <p className="text-sm font-medium text-foreground mb-2">Résumé - {selectedCurrency}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground">Jour</p>
                      <p className="font-semibold text-foreground">{editLimits[cardType]?.daily_limit?.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Semaine</p>
                      <p className="font-semibold text-foreground">{editLimits[cardType]?.weekly_limit?.toLocaleString()}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Mois</p>
                      <p className="font-semibold text-foreground">{editLimits[cardType]?.monthly_limit?.toLocaleString()}</p>
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
            <Button className="flex-1 btn-primary-glow" onClick={handleSave} disabled={saving} data-testid="save-nfc-limits">
              <Save size={14} className="mr-2" />
              {saving ? 'Sauvegarde...' : 'Sauvegarder tout'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
