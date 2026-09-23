import { useState, useEffect, useCallback } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Badge } from '../../components/ui/badge';
import { Checkbox } from '../../components/ui/checkbox';
import { Search, Globe, DollarSign, Check, X, Loader2 } from 'lucide-react';

export default function AdminCountryCurrencies() {
  const [countries, setCountries] = useState([]);
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedCurrencies, setSelectedCurrencies] = useState([]);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [countriesRes, currenciesRes] = await Promise.all([
        API.get('/admin/services/overview'),
        API.get('/currencies')
      ]);
      setCountries(countriesRes.data.countries || []);
      setAllCurrencies(currenciesRes.data || []);
    } catch (e) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openEditModal = async (country) => {
    setSelectedCountry(country);
    try {
      const res = await API.get(`/admin/countries/${country.code}/currencies`);
      setSelectedCurrencies(res.data.accepted_currencies || []);
      setShowModal(true);
    } catch (e) {
      toast.error('Erreur');
    }
  };

  const toggleCurrency = (code) => {
    setSelectedCurrencies(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const saveCurrencies = async () => {
    if (selectedCurrencies.length === 0) {
      toast.error('Sélectionnez au moins une devise');
      return;
    }
    setSaving(true);
    try {
      await API.put(`/admin/countries/${selectedCountry.code}/currencies`, {
        currencies: selectedCurrencies
      });
      toast.success('Devises mises à jour');
      setShowModal(false);
      
      // Update local state
      setCountries(prev => prev.map(c => 
        c.code === selectedCountry.code 
          ? { ...c, accepted_currencies: selectedCurrencies }
          : c
      ));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const filteredCountries = search
    ? countries.filter(c => 
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.code?.toLowerCase().includes(search.toLowerCase())
      )
    : countries;

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="animate-fade-in-up">
        <h2 className="text-xl font-bold text-foreground" style={{fontFamily:'Manrope'}}>
          Devises par Pays
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configurer les devises acceptées dans chaque pays
        </p>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in-up stagger-2">
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin mx-auto mb-2" size={24} />
            Chargement...
          </div>
        ) : filteredCountries.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Globe size={48} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Aucun pays trouvé</p>
          </div>
        ) : filteredCountries.map(country => {
          const currencies = country.accepted_currencies || ['USD'];
          return (
            <div 
              key={country.code}
              onClick={() => openEditModal(country)}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 cursor-pointer transition-all group"
              data-testid={`country-${country.code}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{country.flag}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate">{country.name}</h3>
                  <p className="text-xs text-muted-foreground">{country.code}</p>
                </div>
                <DollarSign size={16} className="text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              
              <div className="flex flex-wrap gap-1.5">
                {currencies.slice(0, 4).map(cur => (
                  <Badge key={cur} variant="secondary" className="text-xs">
                    {cur}
                  </Badge>
                ))}
                {currencies.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{currencies.length - 4}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="bg-card border-border sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle style={{fontFamily:'Manrope'}} className="flex items-center gap-2">
              <span className="text-2xl">{selectedCountry?.flag}</span>
              {selectedCountry?.name}
            </DialogTitle>
            <DialogDescription>
              Sélectionnez les devises acceptées pour ce pays
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-2">
            {allCurrencies.map(currency => {
              const isSelected = selectedCurrencies.includes(currency.code);
              return (
                <div
                  key={currency.code}
                  onClick={() => toggleCurrency(currency.code)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    isSelected 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  <Checkbox checked={isSelected} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{currency.code}</span>
                      <span className="text-muted-foreground">{currency.symbol}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{currency.name}</p>
                  </div>
                  {isSelected && <Check size={16} className="text-primary" />}
                </div>
              );
            })}
          </div>
          
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {selectedCurrencies.length} devise(s) sélectionnée(s)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>
                Annuler
              </Button>
              <Button 
                onClick={saveCurrencies} 
                disabled={saving || selectedCurrencies.length === 0}
                className="btn-primary-glow"
              >
                {saving ? <Loader2 className="animate-spin mr-2" size={14} /> : null}
                Enregistrer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
