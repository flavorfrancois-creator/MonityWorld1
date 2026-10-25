import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Plus, Trash2, RefreshCw, Smartphone, Globe, Key, Copy, Send, Loader2 } from 'lucide-react';

const emptyForm = { name: '', phone: '', password: '', all_states: false, priority: 1 };

export default function SmsGatewayPanel() {
  const [relays, setRelays] = useState([]);
  const [settings, setSettings] = useState({ enabled: true, sms_first: false });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [secret, setSecret] = useState(null);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await API.get('/admin/sms-gateway/relays');
      setRelays(res.data.relays || []);
      setSettings(res.data.settings || { enabled: true, sms_first: false });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de chargement de la passerelle SMS');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const createRelay = async () => {
    if (!form.phone || form.password.length < 8) {
      toast.error('Numéro et mot de passe (8 caractères min.) requis');
      return;
    }
    try {
      const res = await API.post('/admin/sms-gateway/relays', form);
      setSecret({ phone: res.data.relay.phone, key: res.data.connection_key });
      setShowForm(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur de création');
    }
  };

  const update = async (id, body) => {
    try {
      await API.put(`/admin/sms-gateway/relays/${id}`, body);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const rotate = async (relay) => {
    if (!window.confirm(`Générer une nouvelle clé pour ${relay.phone} ? Le téléphone sera déconnecté.`)) return;
    try {
      const res = await API.post(`/admin/sms-gateway/relays/${relay.id}/rotate-key`);
      setSecret({ phone: relay.phone, key: res.data.connection_key });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const remove = async (relay) => {
    if (!window.confirm(`Supprimer le téléphone relais ${relay.phone} ?`)) return;
    try {
      await API.delete(`/admin/sms-gateway/relays/${relay.id}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
    }
  };

  const saveSettings = async (next) => {
    setSettings(next);
    try {
      await API.put('/admin/sms-gateway/settings', next);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Erreur');
      load();
    }
  };

  const sendTest = async () => {
    if (!testPhone) return;
    setTesting(true);
    try {
      await API.post('/admin/sms-gateway/test', { to: testPhone });
      toast.success('SMS de test mis en file : le téléphone relais va l\'envoyer');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Échec');
    } finally {
      setTesting(false);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success('Copié');
  };

  return (
    <div className="space-y-4" data-testid="sms-gateway-panel">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Envoyez les OTP et messages SMS via un téléphone Android avec l'application « Passerelle SMS ».
          Ajoutez un compte relais, puis saisissez dans l'application l'adresse du serveur, le numéro, le mot de passe et la clé de connexion.
          Les SIM sont attribuées automatiquement selon le pays du destinataire ; plusieurs téléphones peuvent se relayer.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} className="mr-2" />Actualiser</Button>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus size={14} className="mr-2" />Ajouter un téléphone</Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">Passerelle SMS activée</p>
            <p className="text-xs text-muted-foreground">Utilisée comme secours quand WhatsApp échoue.</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(v) => saveSettings({ ...settings, enabled: v })} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-foreground">SMS en priorité</p>
            <p className="text-xs text-muted-foreground">Essayer la passerelle SMS avant WhatsApp.</p>
          </div>
          <Switch checked={settings.sms_first} onCheckedChange={(v) => saveSettings({ ...settings, sms_first: v })} />
        </div>
      </div>

      {secret && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-foreground">Clé de connexion pour {secret.phone}</p>
          <p className="text-xs text-muted-foreground">Copiez-la maintenant : elle ne sera plus affichée.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-background rounded px-3 py-2 text-sm break-all">{secret.key}</code>
            <Button size="sm" variant="outline" onClick={() => copy(secret.key)}><Copy size={14} /></Button>
            <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>Fermer</Button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Nom (optionnel)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Téléphone Kinshasa" />
            </div>
            <div>
              <Label>Numéro du compte relais</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+243..." />
            </div>
            <div>
              <Label>Mot de passe (8 caractères min.)</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div>
              <Label>Priorité (1 = prioritaire)</Label>
              <Input type="number" min={1} value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 1 })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.all_states} onCheckedChange={(v) => setForm({ ...form, all_states: v })} />
            <Label>Pour tous les états (secours quand aucune SIM du pays n'est disponible)</Label>
          </div>
          <div className="flex gap-2">
            <Button onClick={createRelay}>Créer</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      {relays.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Smartphone size={48} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Aucun téléphone relais configuré</p>
        </div>
      ) : (
        <div className="space-y-3">
          {relays.map((relay) => (
            <div key={relay.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full ${relay.online ? 'bg-green-500' : 'bg-gray-500'}`} />
                  <div>
                    <p className="font-semibold text-foreground">{relay.name || relay.phone}</p>
                    <p className="text-xs text-muted-foreground">
                      {relay.phone} • {relay.online ? 'En ligne' : 'Hors ligne'} • Priorité {relay.priority}
                      {relay.all_states && <span className="inline-flex items-center gap-1 ml-2"><Globe size={12} />Tous les états</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={relay.active} onCheckedChange={(v) => update(relay.id, { active: v })} />
                  <Button size="sm" variant="outline" onClick={() => update(relay.id, { all_states: !relay.all_states })}>
                    <Globe size={14} className="mr-1" />{relay.all_states ? 'Retirer « tous états »' : 'Tous les états'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rotate(relay)}><Key size={14} className="mr-1" />Nouvelle clé</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(relay)}><Trash2 size={14} className="text-red-400" /></Button>
                </div>
              </div>
              {relay.sims.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-2">
                  {relay.sims.map((sim) => (
                    <div key={sim.id} className="bg-background rounded-lg p-3 text-sm">
                      <p className="font-medium text-foreground">{sim.operator} <span className="text-muted-foreground">({sim.country_iso || sim.country})</span></p>
                      <p className="text-xs text-muted-foreground">{sim.phone || 'Numéro masqué'}</p>
                      <p className="text-xs text-muted-foreground">Envoyés: {sim.sent_count || 0} • Échecs: {sim.failed_count || 0}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Aucune SIM déclarée. Connectez l'application sur le téléphone.</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4">
        <Label>Envoyer un SMS de test</Label>
        <div className="flex gap-2 mt-2">
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+243812345678" />
          <Button onClick={sendTest} disabled={testing || !testPhone}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
