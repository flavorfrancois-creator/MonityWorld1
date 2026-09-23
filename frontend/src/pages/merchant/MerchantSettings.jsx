import { useState, useEffect } from 'react';
import API from '../../utils/api';
import { toast } from 'sonner';
import { Save, Store, Building, Phone, Mail, MapPin, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '../../components/ui/select';

const MERCHANT_API = '/merchant';

const BUSINESS_TYPES = [
  { value: 'restaurant', label: 'Restaurant / Café' },
  { value: 'shop', label: 'Boutique / Commerce' },
  { value: 'service', label: 'Services' },
  { value: 'online', label: 'E-commerce' },
  { value: 'other', label: 'Autre' }
];

export default function MerchantSettings() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    business_name: '',
    business_type: '',
    business_address: '',
    business_description: '',
    tax_id: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await API.get(`${MERCHANT_API}/profile`);
      setProfile(res.data);
      setForm({
        business_name: res.data.business_name || '',
        business_type: res.data.business_type || '',
        business_address: res.data.business_address || '',
        business_description: res.data.business_description || '',
        tax_id: res.data.tax_id || ''
      });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await API.patch(`${MERCHANT_API}/profile`, form);
      toast.success('Profil mis à jour');
      fetchProfile();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSaving(false);
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
    <div className="space-y-6 pb-20 lg:pb-0 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-muted-foreground">Gérez votre profil marchand</p>
      </div>

      {/* Business Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store size={20} />
            Informations de l'entreprise
          </CardTitle>
          <CardDescription>
            Ces informations apparaîtront sur vos factures
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Nom de l'entreprise</Label>
              <Input
                value={form.business_name}
                onChange={(e) => setForm({...form, business_name: e.target.value})}
                placeholder="Ma Boutique"
              />
            </div>

            <div>
              <Label>Type d'activité</Label>
              <Select value={form.business_type} onValueChange={(v) => setForm({...form, business_type: v})}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {BUSINESS_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Adresse</Label>
              <Input
                value={form.business_address}
                onChange={(e) => setForm({...form, business_address: e.target.value})}
                placeholder="123 Rue du Commerce, Kinshasa"
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                value={form.business_description}
                onChange={(e) => setForm({...form, business_description: e.target.value})}
                placeholder="Décrivez votre activité..."
                rows={3}
              />
            </div>

            <div>
              <Label>Numéro fiscal (optionnel)</Label>
              <Input
                value={form.tax_id}
                onChange={(e) => setForm({...form, tax_id: e.target.value})}
                placeholder="NIF-XXXXXXXXXX"
              />
            </div>

            <Button type="submit" disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-600">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informations du compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Building className="text-emerald-500" size={20} />
              </div>
              <div>
                <p className="text-sm font-medium">Code marchand</p>
                <p className="text-xs text-muted-foreground">Identifiant unique</p>
              </div>
            </div>
            <p className="font-mono text-sm">{profile?.merchant_code}</p>
          </div>
          
          <div className="flex items-center justify-between py-3 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="text-blue-500" size={20} />
              </div>
              <div>
                <p className="text-sm font-medium">Ventes totales</p>
                <p className="text-xs text-muted-foreground">Nombre de transactions</p>
              </div>
            </div>
            <p className="font-semibold">{profile?.total_sales || 0}</p>
          </div>
          
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Store className="text-purple-500" size={20} />
              </div>
              <div>
                <p className="text-sm font-medium">Revenus totaux</p>
                <p className="text-xs text-muted-foreground">Depuis l'inscription</p>
              </div>
            </div>
            <p className="font-semibold text-emerald-500">${(profile?.total_revenue || 0).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
