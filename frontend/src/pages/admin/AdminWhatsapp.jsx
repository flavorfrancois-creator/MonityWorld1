import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import API from '../../utils/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import {
  MessageCircle, QrCode, Phone, Globe, Plus, Trash2, RefreshCw, 
  CheckCircle, XCircle, AlertCircle, Loader2, Send, Save, Edit2,
  Headphones, MessageSquare, Clock, Settings, Key, Link, Smartphone,
  ExternalLink, Copy, Info, ScanLine
} from 'lucide-react';

export default function AdminWhatsapp() {
  const [configs, setConfigs] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [connectStep, setConnectStep] = useState('choose'); // choose, qr_code, phone_pairing, cloud_api, success
  const [connectLoading, setConnectLoading] = useState(false);
  
  // QR Code state
  const [qrData, setQrData] = useState(null);
  const qrPollRef = useRef(null);
  
  // Phone pairing state
  const [phoneCountry, setPhoneCountry] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  
  // Cloud API form
  const [cloudApiForm, setCloudApiForm] = useState({
    phoneNumberId: '',
    accessToken: '',
    businessAccountId: ''
  });
  
  // Config form
  const [form, setForm] = useState({
    session_id: '',
    name: '',
    countries: [],
    is_default: false,
    is_active: true,
    config_type: 'otp'
  });

  // Template editing
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    template_name: '',
    message_template: '',
    validity_minutes: 10,
    is_active: true
  });
  
  // Test message
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Validation state
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [validateConfig, setValidateConfig] = useState(null);
  const [validatePhone, setValidatePhone] = useState('');
  const [validateCode, setValidateCode] = useState('');
  const [validateStep, setValidateStep] = useState('send'); // send, confirm, success
  const [validateLoading, setValidateLoading] = useState(false);

  // Country codes for phone pairing (fetched from scraper service)
  const [scraperCountries, setScraperCountries] = useState([]);

  // SMS API state
  const [smsProviders, setSmsProviders] = useState([]);
  const [availableProviders, setAvailableProviders] = useState({ internal_providers: [], external_providers: [] });
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [selectedSmsProvider, setSelectedSmsProvider] = useState(null);
  const [smsForm, setSmsForm] = useState({
    provider_name: '',
    provider_code: '',
    service_type: 'external',
    api_base_url: '',
    api_key: '',
    api_secret: '',
    sender_id: '',
    auth_token: '',
    account_sid: '',
    countries: [],
    is_active: true,
    is_default: false,
    priority: 1,
    cost_per_sms: 0,
    currency: 'USD'
  });
  const [smsTestPhone, setSmsTestPhone] = useState('');
  const [smsTestMessage, setSmsTestMessage] = useState('Test SMS depuis Monity World');
  const [smsTesting, setSmsTesting] = useState(false);

  // SMTP email connections state
  const [smtpConfigs, setSmtpConfigs] = useState([]);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [selectedSmtpConfig, setSelectedSmtpConfig] = useState(null);
  const [smtpForm, setSmtpForm] = useState({
    provider_name: '',
    provider_code: '',
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: 'Monity World',
    use_tls: true,
    countries: [],
    is_all_states: false,
    is_active: true,
    is_default: false,
    priority: 1
  });
  const [smtpTestEmail, setSmtpTestEmail] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [configsRes, templatesRes, countriesRes, statsRes, scraperCountriesRes, smsProvidersRes, availableProvidersRes, smtpConfigsRes] = await Promise.all([
        API.get('/admin/whatsapp/configs'),
        API.get('/admin/whatsapp/otp-templates'),
        API.get('/admin/countries'),
        API.get('/admin/whatsapp/stats').catch(() => ({ data: null })),
        API.get('/admin/whatsapp/scraper-countries').catch(() => ({ data: { countries: [] } })),
        API.get('/admin/sms-providers').catch(() => ({ data: { providers: [] } })),
        API.get('/admin/sms-providers/available').catch(() => ({ data: { internal_providers: [], external_providers: [] } })),
        API.get('/admin/smtp-configs').catch(() => ({ data: { configs: [] } }))
      ]);
      setConfigs(configsRes.data.configs || []);
      setTemplates(templatesRes.data.templates || []);
      setCountries(countriesRes.data.countries || []);
      setStats(statsRes.data);
      if (scraperCountriesRes.data?.countries?.length > 0) {
        setScraperCountries(scraperCountriesRes.data.countries);
      }
      setSmsProviders(smsProvidersRes.data.providers || []);
      setAvailableProviders(availableProvidersRes.data || { internal_providers: [], external_providers: [] });
      setSmtpConfigs(smtpConfigsRes.data.configs || []);
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error('Accès réservé à l\'administrateur principal');
      } else {
        toast.error('Erreur lors du chargement des données');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, [fetchData]);

  // Create/Update config
  const handleSaveConfig = async () => {
    if (!form.session_id || !form.name) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }
    
    try {
      if (selectedConfig) {
        await API.put(`/admin/whatsapp/configs/${selectedConfig.id}`, form);
        toast.success('Configuration mise à jour');
      } else {
        await API.post('/admin/whatsapp/configs', form);
        toast.success('Configuration créée');
      }
      setShowAddModal(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    }
  };

  // Delete config
  const handleDeleteConfig = async (configId) => {
    if (!window.confirm('Supprimer cette configuration WhatsApp ?')) return;
    
    try {
      await API.delete(`/admin/whatsapp/configs/${configId}`);
      toast.success('Configuration supprimée');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la suppression');
    }
  };

  // Open connect modal
  const handleOpenConnect = (config) => {
    setSelectedConfig(config);
    setConnectStep('choose');
    setQrData(null);
    setPairingCode('');
    setPhoneCountry('');
    setPhoneNumber('');
    setCloudApiForm({ phoneNumberId: '', accessToken: '', businessAccountId: '' });
    setShowConnectModal(true);
  };

  // Close connect modal
  const handleCloseConnect = () => {
    if (qrPollRef.current) {
      clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
    setShowConnectModal(false);
    setQrData(null);
    setPairingCode('');
  };

  // Start QR Code connection — fetch QR with retries for production (browser launch is slower)
  const handleStartQRCode = async () => {
    setConnectStep('qr_code');
    setConnectLoading(true);
    setQrData(null);

    try {
      await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/connect`, {
        method: 'qr_code'
      });

      // Production: browser launch can take 30-60s. Retry aggressively.
      const fetchWithRetry = async () => {
        await new Promise(r => setTimeout(r, 8000)); // initial wait for browser launch
        
        for (let i = 0; i < 10; i++) {
          try {
            const res = await API.get(`/admin/whatsapp/configs/${selectedConfig.id}/qr`);
            const status = res.data?.status;
            if (status === 'qr_ready' && res.data?.qr) {
              setQrData(res.data);
              setConnectLoading(false);
              return;
            }
            if (status === 'ready') {
              setConnectStep('success');
              setConnectLoading(false);
              toast.success('WhatsApp deja connecte !');
              fetchData();
              return;
            }
            if (status === 'error') {
              setQrData({ status: 'error', error: res.data?.error });
              setConnectLoading(false);
              return;
            }
          } catch (err) {
            console.error('QR fetch attempt', i + 1, err);
          }
          // Wait 5s between retries (total window: 8s + 10×5s = ~58s)
          if (i < 9) await new Promise(r => setTimeout(r, 5000));
        }
        // After all retries, show retry button
        setQrData({ status: 'retry_needed' });
        setConnectLoading(false);
      };

      fetchWithRetry();
    } catch (err) {
      setConnectLoading(false);
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Erreur d\'initialisation');
    }
  };

  // Refresh QR code — single call then fetch with retry
  const handleRefreshQR = async () => {
    setQrData(null);
    setConnectLoading(true);
    
    try {
      await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/refresh-qr`);
      // Wait then fetch with retries
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 4000));
        try {
          const qrRes = await API.get(`/admin/whatsapp/configs/${selectedConfig.id}/qr`);
          if (qrRes.data?.qr) {
            setQrData(qrRes.data);
            setConnectLoading(false);
            return;
          }
        } catch (e) {}
      }
      setQrData({ status: 'retry_needed' });
    } catch (err) {
      toast.error('Erreur lors du rafraichissement');
    }
    setConnectLoading(false);
  };

  // Manual confirm: user clicks "Numéro connecté" — checks page status on-demand
  const handleManualConfirmConnected = async () => {
    setConnectLoading(true);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/check-connection`);
      if (res.data.status === 'ready' && res.data.connected) {
        if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
        setConnectStep('success');
        toast.success('WhatsApp connecté !');
        fetchData();
      } else if (res.data.status === 'waiting_scan') {
        toast.info(res.data.message || 'QR code toujours visible. Scannez-le avec votre téléphone.');
      } else {
        toast.info(res.data.message || 'Connexion non encore détectée. Réessayez dans quelques secondes.');
      }
    } catch (err) {
      toast.error('Erreur lors de la vérification');
    } finally {
      setConnectLoading(false);
    }
  };

  // Start phone pairing
  const handleStartPhonePairing = () => {
    setConnectStep('phone_pairing');
    setPairingCode('');
  };

  // Request pairing code
  const handleRequestPairingCode = async () => {
    if (!phoneCountry || !phoneNumber) {
      toast.error('Veuillez sélectionner un pays et entrer votre numéro');
      return;
    }

    setConnectLoading(true);

    try {
      // Initialize session first if needed
      await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/connect`, {
        method: 'qr_code'
      });

      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Request pairing code
      const res = await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/pairing-code`, {
        countryCode: phoneCountry,
        phoneNumber: phoneNumber
      });

      if (res.data.code) {
        setPairingCode(res.data.code);
        setConnectStep('phone_pairing_code');
        toast.success('Code généré !');
      } else {
        toast.error(res.data.error || 'Erreur lors de la génération du code');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Erreur lors de la génération du code');
    } finally {
      setConnectLoading(false);
    }
  };

  // Confirm phone pairing
  const handleConfirmPhonePairing = async () => {
    setConnectLoading(true);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/confirm-pairing`);
      if (res.data.success && res.data.status === 'ready') {
        setConnectStep('success');
        toast.success('WhatsApp connecté !');
        fetchData();
      } else {
        toast.info('En attente de la connexion... Vérifiez votre téléphone.');
      }
    } catch (err) {
      toast.error('Erreur de confirmation');
    } finally {
      setConnectLoading(false);
    }
  };

  // Configure Cloud API
  const handleConfigureCloudAPI = async () => {
    if (!cloudApiForm.phoneNumberId || !cloudApiForm.accessToken) {
      toast.error('Phone Number ID et Access Token sont requis');
      return;
    }

    setConnectLoading(true);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${selectedConfig.id}/configure`, {
        method: 'cloud_api',
        phoneNumberId: cloudApiForm.phoneNumberId,
        accessToken: cloudApiForm.accessToken,
        businessAccountId: cloudApiForm.businessAccountId
      });
      
      if (res.data.success) {
        setConnectStep('success');
        toast.success('Configuration Cloud API réussie !');
        fetchData();
      } else {
        toast.error(res.data.error || 'Erreur de configuration');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Erreur de configuration');
    } finally {
      setConnectLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié !');
  };

  // Disconnect WhatsApp
  const handleDisconnect = async (config) => {
    if (!window.confirm('Déconnecter ce numéro WhatsApp ?')) return;
    
    try {
      await API.post(`/admin/whatsapp/configs/${config.id}/disconnect`);
      toast.success('WhatsApp déconnecté');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la déconnexion');
    }
  };

  // Send test message
  const handleTestSend = async () => {
    if (!testPhone || !testMessage) {
      toast.error('Veuillez entrer un numéro et un message');
      return;
    }
    
    setSending(true);
    try {
      const res = await API.post('/admin/whatsapp/test-send', {
        phone: testPhone,
        message: testMessage
      });
      if (res.data.result?.success) {
        toast.success('Message envoyé !');
        setTestMessage('');
      } else {
        toast.error(res.data.result?.error || 'Échec de l\'envoi');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  // Open validation modal for a config
  const handleOpenValidate = (config) => {
    setValidateConfig(config);
    setValidatePhone('');
    setValidateCode('');
    setValidateStep('send');
    setShowValidateModal(true);
  };

  // Send validation OTP
  const handleSendValidationCode = async () => {
    if (!validatePhone) {
      toast.error('Veuillez entrer un numero de telephone');
      return;
    }
    setValidateLoading(true);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${validateConfig.id}/validate-send`, {
        phone: validatePhone
      });
      if (res.data.success) {
        setValidateStep('confirm');
        toast.success('Code envoye !');
      } else {
        toast.error(res.data.error || 'Echec de l\'envoi');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error || 'Erreur lors de l\'envoi');
    } finally {
      setValidateLoading(false);
    }
  };

  // Confirm validation code received
  const handleConfirmValidation = async () => {
    if (!validateCode || validateCode.length < 6) {
      toast.error('Veuillez entrer le code a 6 chiffres');
      return;
    }
    setValidateLoading(true);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${validateConfig.id}/validate-confirm`, {
        code: validateCode
      });
      if (res.data.success) {
        setValidateStep('success');
        toast.success('Configuration validee !');
        fetchData();
      } else {
        toast.error(res.data.error || 'Code incorrect');
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur de validation');
    } finally {
      setValidateLoading(false);
    }
  };


  // Save OTP template
  const handleSaveTemplate = async () => {
    if (!templateForm.template_name || !templateForm.message_template) {
      toast.error('Veuillez remplir tous les champs');
      return;
    }
    
    if (!templateForm.message_template.includes('{code}')) {
      toast.error('Le message doit contenir {code}');
      return;
    }
    
    try {
      await API.post('/admin/whatsapp/otp-templates', templateForm);
      toast.success('Template sauvegardé');
      setEditingTemplate(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    }
  };

  // Reset form
  const resetForm = () => {
    setForm({
      session_id: '',
      name: '',
      countries: [],
      is_default: false,
      is_active: true,
      config_type: 'otp'
    });
    setSelectedConfig(null);
  };

  // Edit config
  const handleEditConfig = (config) => {
    setSelectedConfig(config);
    setForm({
      session_id: config.session_id,
      name: config.name,
      countries: config.countries || [],
      is_default: config.is_default || false,
      is_active: config.is_active ?? true,
      config_type: config.config_type || 'otp'
    });
    setShowAddModal(true);
  };

  // === SMS Provider Functions ===
  const resetSmsForm = () => {
    setSmsForm({
      provider_name: '',
      provider_code: '',
      service_type: 'external',
      api_base_url: '',
      api_key: '',
      api_secret: '',
      sender_id: '',
      auth_token: '',
      account_sid: '',
      countries: [],
      is_active: true,
      is_default: false,
      priority: 1,
      cost_per_sms: 0,
      currency: 'USD'
    });
    setSelectedSmsProvider(null);
  };

  const handleSelectProviderTemplate = (provider) => {
    setSmsForm({
      ...smsForm,
      provider_name: provider.name,
      provider_code: provider.code,
      service_type: provider.service_type,
      api_base_url: provider.api_base_url || ''
    });
  };

  const handleSaveSmsProvider = async () => {
    if (!smsForm.provider_code || !smsForm.provider_name) {
      toast.error('Veuillez remplir les champs requis');
      return;
    }

    try {
      await API.post('/admin/sms-providers', smsForm);
      toast.success('Fournisseur SMS configure');
      setShowSmsModal(false);
      resetSmsForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleDeleteSmsProvider = async (providerCode) => {
    if (!window.confirm('Supprimer ce fournisseur SMS ?')) return;

    try {
      await API.delete(`/admin/sms-providers/${providerCode}`);
      toast.success('Fournisseur supprime');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleEditSmsProvider = (provider) => {
    setSelectedSmsProvider(provider);
    setSmsForm({
      provider_name: provider.provider_name,
      provider_code: provider.provider_code,
      service_type: provider.service_type || 'external',
      api_base_url: provider.api_base_url || '',
      api_key: provider.api_key || '',
      api_secret: '',
      sender_id: provider.sender_id || '',
      auth_token: '',
      account_sid: provider.account_sid || '',
      countries: provider.countries || [],
      is_active: provider.is_active ?? true,
      is_default: provider.is_default || false,
      priority: provider.priority || 1,
      cost_per_sms: provider.cost_per_sms || 0,
      currency: provider.currency || 'USD'
    });
    setShowSmsModal(true);
  };

  const handleTestSmsProvider = async (provider) => {
    if (!smsTestPhone) {
      toast.error('Entrez un numero de telephone');
      return;
    }

    setSmsTesting(true);
    try {
      const res = await API.post(`/admin/sms-providers/${provider.provider_code}/test`, {
        provider_code: provider.provider_code,
        phone_number: smsTestPhone,
        message: smsTestMessage
      });
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSmsTesting(false);
    }
  };

  // === SMTP EMAIL CONNECTIONS ===
  const resetSmtpForm = () => {
    setSmtpForm({
      provider_name: '',
      provider_code: '',
      host: '',
      port: 587,
      username: '',
      password: '',
      from_email: '',
      from_name: 'Monity World',
      use_tls: true,
      countries: [],
      is_all_states: false,
      is_active: true,
      is_default: false,
      priority: 1
    });
    setSelectedSmtpConfig(null);
  };

  const handleSaveSmtpConfig = async () => {
    if (!smtpForm.provider_code || !smtpForm.provider_name || !smtpForm.host || !smtpForm.username || !smtpForm.from_email) {
      toast.error('Veuillez remplir les champs requis');
      return;
    }
    if (!selectedSmtpConfig && !smtpForm.password) {
      toast.error('Le mot de passe est requis pour une nouvelle connexion');
      return;
    }

    try {
      await API.post('/admin/smtp-configs', smtpForm);
      toast.success('Connexion SMTP configuree');
      setShowSmtpModal(false);
      resetSmtpForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleDeleteSmtpConfig = async (providerCode) => {
    if (!window.confirm('Supprimer cette connexion SMTP ?')) return;

    try {
      await API.delete(`/admin/smtp-configs/${providerCode}`);
      toast.success('Connexion supprimee');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    }
  };

  const handleEditSmtpConfig = (config) => {
    setSelectedSmtpConfig(config);
    setSmtpForm({
      provider_name: config.provider_name,
      provider_code: config.provider_code,
      host: config.host || '',
      port: config.port || 587,
      username: config.username || '',
      password: '',
      from_email: config.from_email || '',
      from_name: config.from_name || 'Monity World',
      use_tls: config.use_tls ?? true,
      countries: config.countries || [],
      is_all_states: config.is_all_states || false,
      is_active: config.is_active ?? true,
      is_default: config.is_default || false,
      priority: config.priority || 1
    });
    setShowSmtpModal(true);
  };

  const handleTestSmtpConfig = async (config) => {
    if (!smtpTestEmail) {
      toast.error('Entrez une adresse mail de test');
      return;
    }

    setSmtpTesting(true);
    try {
      const res = await API.post(`/admin/smtp-configs/${config.provider_code}/test`, {
        provider_code: config.provider_code,
        to_email: smtpTestEmail
      });
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setSmtpTesting(false);
    }
  };

  // Get status badge
  const getStatusBadge = (status, method) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30"><CheckCircle size={12} className="mr-1" />Connecté</Badge>;
      case 'qr_ready':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30"><QrCode size={12} className="mr-1" />QR prêt</Badge>;
      case 'initializing':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30"><Loader2 size={12} className="mr-1 animate-spin" />Initialisation</Badge>;
      case 'pairing_code_ready':
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30"><Phone size={12} className="mr-1" />Code prêt</Badge>;
      default:
        return <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30"><XCircle size={12} className="mr-1" />Non connecté</Badge>;
    }
  };

  // Filter configs by type
  const otpConfigs = configs.filter(c => c.config_type !== 'support');
  const supportConfigs = configs.filter(c => c.config_type === 'support');

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in-up">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2" style={{fontFamily:'Manrope'}}>
            <MessageCircle className="text-green-500" /> Gestion des connexions & SMS
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Configurez les connexions et les API SMS pour les OTP et notifications</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { resetSmtpForm(); setShowSmtpModal(true); }} variant="outline" data-testid="add-smtp-btn">
            <Send size={16} className="mr-2" /> Ajouter SMTP
          </Button>
          <Button onClick={() => { resetSmsForm(); setShowSmsModal(true); }} variant="outline" data-testid="add-sms-api-btn">
            <MessageSquare size={16} className="mr-2" /> Ajouter API SMS
          </Button>
          <Button onClick={() => { resetForm(); setShowAddModal(true); }} className="btn-primary-glow" data-testid="add-whatsapp-btn">
            <Plus size={16} className="mr-2" /> Ajouter une connexion
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-in-up stagger-1">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Send size={18} className="text-green-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Messages envoyés</p>
                <p className="text-xl font-bold text-foreground">{stats.total_messages || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <CheckCircle size={18} className="text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Réussis</p>
                <p className="text-xl font-bold text-foreground">{stats.by_status?.sent || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <XCircle size={18} className="text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Échoués</p>
                <p className="text-xl font-bold text-foreground">{stats.by_status?.failed || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Phone size={18} className="text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Numéros actifs</p>
                <p className="text-xl font-bold text-foreground">{stats.active_configs || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="otp" className="animate-fade-in-up stagger-2">
        <TabsList className="bg-secondary/50 flex-wrap">
          <TabsTrigger value="otp" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <MessageSquare size={16} className="mr-2" /> Numéros OTP ({otpConfigs.length})
          </TabsTrigger>
          <TabsTrigger value="support" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Headphones size={16} className="mr-2" /> Support Client ({supportConfigs.length})
          </TabsTrigger>
          <TabsTrigger value="sms" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Smartphone size={16} className="mr-2" /> API SMS ({smsProviders.length})
          </TabsTrigger>
          <TabsTrigger value="smtp" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Send size={16} className="mr-2" /> SMTP Email ({smtpConfigs.length})
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings size={16} className="mr-2" /> Templates OTP
          </TabsTrigger>
          <TabsTrigger value="test" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Send size={16} className="mr-2" /> Test
          </TabsTrigger>
        </TabsList>

        {/* OTP Numbers */}
        <TabsContent value="otp" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Ces numéros sont utilisés pour envoyer les codes OTP et notifications aux clients.</p>
          
          {otpConfigs.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <MessageCircle size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun numéro OTP configuré</p>
              <Button onClick={() => { resetForm(); setForm(f => ({...f, config_type: 'otp'})); setShowAddModal(true); }} className="mt-4" variant="outline">
                <Plus size={16} className="mr-2" /> Ajouter un numéro OTP
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {otpConfigs.map((config) => (
                <WhatsAppConfigCard
                  key={config.id}
                  config={config}
                  countries={countries}
                  onConnect={handleOpenConnect}
                  onDisconnect={handleDisconnect}
                  onEdit={handleEditConfig}
                  onDelete={handleDeleteConfig}
                  onValidate={handleOpenValidate}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* SMS API Tab */}
        <TabsContent value="sms" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Configurez les API SMS externes comme alternative ou complément à WhatsApp.</p>
            <Button onClick={() => { resetSmsForm(); setShowSmsModal(true); }} variant="outline" size="sm">
              <Plus size={14} className="mr-2" /> Ajouter
            </Button>
          </div>
          
          {smsProviders.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Smartphone size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucune API SMS configurée</p>
              <p className="text-xs text-muted-foreground mt-2">Ajoutez Twilio, Nexmo, Orange SMS ou une API personnalisée</p>
              <Button onClick={() => { resetSmsForm(); setShowSmsModal(true); }} className="mt-4" variant="outline">
                <Plus size={16} className="mr-2" /> Configurer une API SMS
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {smsProviders.map((provider) => (
                <div key={provider.provider_code} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        provider.service_type === 'internal' ? 'bg-green-500/10' : 'bg-blue-500/10'
                      }`}>
                        {provider.service_type === 'internal' ? (
                          <MessageCircle size={24} className="text-green-400" />
                        ) : (
                          <Smartphone size={24} className="text-blue-400" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{provider.provider_name}</p>
                        <p className="text-xs text-muted-foreground">{provider.provider_code} • {provider.service_type === 'internal' ? 'Service Interne' : 'API Externe'}</p>
                        {provider.countries?.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">Pays: {provider.countries.join(', ')}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Priorité: {provider.priority}</p>
                        {provider.cost_per_sms > 0 && (
                          <p className="text-muted-foreground">{provider.cost_per_sms} {provider.currency}/SMS</p>
                        )}
                      </div>
                      
                      <Badge className={provider.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                        {provider.is_active ? 'Actif' : 'Inactif'}
                      </Badge>
                      
                      {provider.is_default && (
                        <Badge className="bg-primary/20 text-primary">Défaut</Badge>
                      )}
                      
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEditSmsProvider(provider)}>
                          <Edit2 size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDeleteSmsProvider(provider.provider_code)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* SMTP Email Connections Tab */}
        <TabsContent value="smtp" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Configurez des serveurs SMTP pour envoyer les liens de réinitialisation de mot de passe et les OTP par email. Vous pouvez ajouter plusieurs connexions, une par pays ou une connexion "pour tous les états" utilisée en secours si celle du pays n'est pas disponible.</p>
            <Button onClick={() => { resetSmtpForm(); setShowSmtpModal(true); }} variant="outline" size="sm">
              <Plus size={14} className="mr-2" /> Ajouter
            </Button>
          </div>

          {smtpConfigs.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Send size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucune connexion SMTP configurée</p>
              <p className="text-xs text-muted-foreground mt-2">Ajoutez Gmail, Outlook, SendGrid ou tout autre serveur SMTP</p>
              <Button onClick={() => { resetSmtpForm(); setShowSmtpModal(true); }} className="mt-4" variant="outline">
                <Plus size={16} className="mr-2" /> Configurer une connexion SMTP
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {smtpConfigs.map((config) => (
                <div key={config.provider_code} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-500/10">
                        <Send size={24} className="text-indigo-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{config.provider_name}</p>
                        <p className="text-xs text-muted-foreground">{config.provider_code} • {config.host}:{config.port}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {config.is_all_states ? (
                            <span className="inline-flex items-center gap-1"><Globe size={12} /> Pour tous les états</span>
                          ) : config.countries?.length > 0 ? (
                            `Pays: ${config.countries.join(', ')}`
                          ) : (
                            'Tous les pays'
                          )}
                        </p>
                        {config.last_status && (
                          <p className={`text-xs mt-1 ${config.last_status === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                            Dernier test: {config.last_status === 'success' ? 'réussi' : 'échoué'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">Priorité: {config.priority}</p>
                      </div>

                      <Badge className={config.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}>
                        {config.is_active ? 'Actif' : 'Inactif'}
                      </Badge>

                      {config.is_default && (
                        <Badge className="bg-primary/20 text-primary">Défaut</Badge>
                      )}

                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleTestSmtpConfig(config)} disabled={smtpTesting} title="Envoyer un email de test">
                          <Send size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleEditSmtpConfig(config)}>
                          <Edit2 size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-400" onClick={() => handleDeleteSmtpConfig(config.provider_code)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-4 max-w-sm">
            <Label className="text-xs text-muted-foreground">Adresse mail de test (utilisée par le bouton d'envoi de test ci-dessus)</Label>
            <Input className="mt-2" placeholder="test@exemple.com" value={smtpTestEmail} onChange={(e) => setSmtpTestEmail(e.target.value)} />
          </div>
        </TabsContent>

        {/* Support Numbers */}
        <TabsContent value="support" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Ces numéros sont dédiés au service client et aux réclamations. Ils ne reçoivent pas les codes OTP.</p>
          
          {supportConfigs.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Headphones size={48} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">Aucun numéro support configuré</p>
              <Button onClick={() => { resetForm(); setForm(f => ({...f, config_type: 'support'})); setShowAddModal(true); }} className="mt-4" variant="outline">
                <Plus size={16} className="mr-2" /> Ajouter un numéro support
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {supportConfigs.map((config) => (
                <WhatsAppConfigCard
                  key={config.id}
                  config={config}
                  countries={countries}
                  onConnect={handleOpenConnect}
                  onDisconnect={handleDisconnect}
                  onEdit={handleEditConfig}
                  onDelete={handleDeleteConfig}
                  onValidate={handleOpenValidate}
                  getStatusBadge={getStatusBadge}
                  isSupport
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* OTP Templates */}
        <TabsContent value="templates" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">Personnalisez les messages OTP. Utilisez <code className="bg-secondary px-1 rounded">{'{code}'}</code> et <code className="bg-secondary px-1 rounded">{'{validity}'}</code>.</p>
          
          <div className="grid gap-4">
            {templates.map((template) => (
              <div key={template.template_name} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-foreground capitalize">{template.template_name}</h4>
                      {template.is_default && <Badge variant="outline" className="text-xs">Par défaut</Badge>}
                    </div>
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-secondary/30 p-3 rounded-lg font-mono text-xs">
                      {template.message_template}
                    </pre>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>Validité: {template.validity_minutes} minutes</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => {
                    setEditingTemplate(template.template_name);
                    setTemplateForm({
                      template_name: template.template_name,
                      message_template: template.message_template,
                      validity_minutes: template.validity_minutes || 10,
                      is_active: template.is_active !== false
                    });
                  }}>
                    <Edit2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Test Send */}
        <TabsContent value="test" className="mt-4">
          <div className="bg-card border border-border rounded-xl p-5 max-w-md">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Send size={18} className="text-primary" /> Envoyer un message test
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Numéro de téléphone</Label>
                <Input placeholder="+243 XXX XXX XXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea placeholder="Votre message..." value={testMessage} onChange={(e) => setTestMessage(e.target.value)} rows={4} />
              </div>
              <Button onClick={handleTestSend} disabled={sending || !testPhone || !testMessage} className="w-full">
                {sending ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
                {sending ? 'Envoi...' : 'Envoyer'}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {selectedConfig ? 'Modifier' : 'Nouvelle configuration'}
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.config_type} onValueChange={(v) => setForm({...form, config_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="otp"><MessageSquare size={14} className="inline mr-2" />OTP & Notifications</SelectItem>
                    <SelectItem value="support"><Headphones size={14} className="inline mr-2" />Support Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Identifiant de session *</Label>
                <Input placeholder="ex: whatsapp-rdc-otp" value={form.session_id} onChange={(e) => setForm({...form, session_id: e.target.value})} disabled={!!selectedConfig} />
              </div>

              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input placeholder="ex: WhatsApp RDC" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} />
              </div>

              <div className="space-y-2">
                <Label>Pays assignés</Label>
                <Select value={form.countries.length > 0 ? form.countries[0] : '*'} onValueChange={(v) => setForm({...form, countries: v === '*' ? ['*'] : [v]})}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="*"><Globe size={14} className="inline mr-2" />Tous les pays</SelectItem>
                    {countries.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label>Par défaut</Label>
                <Switch checked={form.is_default} onCheckedChange={(v) => setForm({...form, is_default: v})} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setShowAddModal(false); resetForm(); }}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleSaveConfig}><Save size={16} className="mr-2" />Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            
            {/* Step: Choose method */}
            {connectStep === 'choose' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2">Connecter WhatsApp</h3>
                <p className="text-sm text-muted-foreground mb-6">{selectedConfig?.name}</p>

                <div className="space-y-3">
                  <button onClick={handleStartQRCode} className="w-full p-4 bg-secondary/30 hover:bg-secondary/50 border border-border rounded-xl text-left transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                        <QrCode size={20} className="text-green-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground">QR Code</h4>
                          <Badge className="bg-green-500/20 text-green-400 text-xs">Recommandé</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">Scannez le QR code avec WhatsApp sur votre téléphone.</p>
                      </div>
                    </div>
                  </button>

                  <button onClick={handleStartPhonePairing} className="w-full p-4 bg-secondary/30 hover:bg-secondary/50 border border-border rounded-xl text-left transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                        <Smartphone size={20} className="text-blue-400" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">Numéro de téléphone</h4>
                        <p className="text-sm text-muted-foreground mt-1">Connectez avec un code OTP envoyé sur WhatsApp.</p>
                      </div>
                    </div>
                  </button>

                  <button onClick={() => setConnectStep('cloud_api')} className="w-full p-4 bg-secondary/30 hover:bg-secondary/50 border border-border rounded-xl text-left transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                        <Key size={20} className="text-purple-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-foreground">Cloud API</h4>
                          <Badge variant="outline" className="text-xs">Production</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">API officielle Meta Business.</p>
                      </div>
                    </div>
                  </button>
                </div>

                <Button variant="outline" className="w-full mt-6" onClick={handleCloseConnect}>Annuler</Button>
              </>
            )}

            {/* Step: QR Code */}
            {connectStep === 'qr_code' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <QrCode size={20} className="text-green-400" /> Scanner le QR Code
                </h3>
                <p className="text-sm text-muted-foreground mb-4">Scannez ce code avec WhatsApp sur votre téléphone</p>

                <div className="bg-white rounded-xl p-4 flex items-center justify-center min-h-[280px]" data-testid="qr-code-display">
                  {connectLoading ? (
                    <div className="text-center">
                      <Loader2 size={48} className="animate-spin text-green-500 mx-auto mb-3" />
                      <p className="text-gray-600 font-medium">Lancement du navigateur...</p>
                      <p className="text-xs text-gray-400 mt-1">Connexion a web.whatsapp.com en cours</p>
                      <p className="text-xs text-gray-400 mt-1">Cela peut prendre jusqu'a 60 secondes</p>
                    </div>
                  ) : qrData?.status === 'error' ? (
                    <div className="text-center">
                      <XCircle size={48} className="text-red-500 mx-auto mb-3" />
                      <p className="text-gray-600">Erreur: {qrData?.error || 'Erreur inconnue'}</p>
                      <Button onClick={handleRefreshQR} className="mt-3" size="sm" data-testid="retry-error-btn">
                        <RefreshCw size={14} className="mr-1" /> Reessayer
                      </Button>
                    </div>
                  ) : qrData?.expired || qrData?.status === 'qr_expired' ? (
                    <div className="text-center">
                      <AlertCircle size={48} className="text-yellow-500 mx-auto mb-3" />
                      <p className="text-gray-600">QR code expiré</p>
                      <Button onClick={handleRefreshQR} className="mt-3" size="sm" data-testid="refresh-qr-btn">
                        <RefreshCw size={14} className="mr-1" /> Rafraîchir
                      </Button>
                    </div>
                  ) : qrData?.qr ? (
                    <div className="text-center">
                      <img src={qrData.qr} alt="QR Code WhatsApp" className="w-64 h-64 mx-auto" />
                      <p className="text-xs text-green-600 mt-2 flex items-center justify-center gap-1">
                        Page WhatsApp Web autonome — scannez puis cliquez "Numéro connecté"
                      </p>
                    </div>
                  ) : qrData?.status === 'retry_needed' ? (
                    <div className="text-center">
                      <AlertCircle size={48} className="text-yellow-500 mx-auto mb-3" />
                      <p className="text-gray-600">Le QR code n'est pas encore prêt</p>
                      <p className="text-xs text-gray-400 mb-3">Le navigateur peut prendre plus de temps en production</p>
                      <Button onClick={handleRefreshQR} size="sm" data-testid="retry-qr-btn">
                        <RefreshCw size={14} className="mr-1" /> Réessayer
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <ScanLine size={48} className="text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">En attente du QR code...</p>
                      <Button onClick={handleRefreshQR} className="mt-3" size="sm" variant="outline">
                        <RefreshCw size={14} className="mr-1" /> Recharger
                      </Button>
                    </div>
                  )}
                </div>

                <div className="bg-secondary/30 rounded-lg p-3 mt-4">
                  <p className="text-xs text-muted-foreground">
                    <strong>Instructions:</strong> WhatsApp → Paramètres → Appareils liés → Lier un appareil → Scanner
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    <CheckCircle size={10} className="inline mr-1 text-green-400" />
                    Après le scan, cliquez "Numéro connecté" pour confirmer la liaison.
                  </p>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button variant="outline" className="flex-1" onClick={() => setConnectStep('choose')}>Retour</Button>
                  <Button variant="outline" onClick={handleRefreshQR} disabled={connectLoading} data-testid="manual-refresh-btn">
                    <RefreshCw size={14} className="mr-1" />Rafraîchir
                  </Button>
                  <Button className="flex-1 btn-primary-glow" onClick={handleManualConfirmConnected} disabled={connectLoading} data-testid="confirm-connected-btn">
                    {connectLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <CheckCircle size={14} className="mr-1" />}
                    Numéro connecté
                  </Button>
                </div>
              </>
            )}

            {/* Step: Phone Pairing - Enter number */}
            {connectStep === 'phone_pairing' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Smartphone size={20} className="text-blue-400" /> Connexion par numéro
                </h3>
                <p className="text-sm text-muted-foreground mb-6">Entrez votre numéro WhatsApp</p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Pays</Label>
                    <Select value={phoneCountry} onValueChange={setPhoneCountry}>
                      <SelectTrigger data-testid="phone-country-select"><SelectValue placeholder="Sélectionnez votre pays" /></SelectTrigger>
                      <SelectContent>
                        {scraperCountries.map((c, i) => (
                          <SelectItem key={`${c.code}-${i}`} value={c.code}>
                            {c.name} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Numéro de téléphone</Label>
                    <div className="flex gap-2">
                      <div className="w-20 flex items-center justify-center bg-secondary/50 rounded-lg text-sm font-medium">
                        {phoneCountry || '+XXX'}
                      </div>
                      <Input 
                        data-testid="phone-number-input"
                        placeholder="999 000 000" 
                        value={phoneNumber} 
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                        className="flex-1"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Entrez votre numéro sans le code pays</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" className="flex-1" onClick={() => setConnectStep('choose')}>Retour</Button>
                  <Button 
                    className="flex-1 btn-primary-glow" 
                    onClick={handleRequestPairingCode}
                    disabled={connectLoading || !phoneCountry || !phoneNumber}
                  >
                    {connectLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                    Suivant
                  </Button>
                </div>
              </>
            )}

            {/* Step: Phone Pairing - Show code */}
            {connectStep === 'phone_pairing_code' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Phone size={20} className="text-blue-400" /> Code de liaison
                </h3>
                <p className="text-sm text-muted-foreground mb-6">Entrez ce code dans WhatsApp sur votre téléphone</p>

                <div className="bg-white rounded-xl p-6 text-center">
                  <p className="text-4xl font-mono font-bold text-gray-900 tracking-widest">
                    {pairingCode || '--------'}
                  </p>
                  <Button variant="ghost" size="sm" className="mt-2 text-gray-600" onClick={() => copyToClipboard(pairingCode)}>
                    <Copy size={14} className="mr-1" /> Copier
                  </Button>
                </div>

                <div className="bg-secondary/30 rounded-lg p-4 mt-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">Instructions:</p>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Ouvrez WhatsApp sur votre téléphone</li>
                    <li>Allez dans <strong>Paramètres</strong> → <strong>Appareils liés</strong></li>
                    <li>Appuyez sur <strong>Lier un appareil</strong></li>
                    <li>Choisissez <strong>Lier avec numéro de téléphone</strong></li>
                    <li>Entrez le code ci-dessus</li>
                  </ol>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" className="flex-1" onClick={() => setConnectStep('phone_pairing')}>Retour</Button>
                  <Button className="flex-1 btn-primary-glow" onClick={handleConfirmPhonePairing} disabled={connectLoading}>
                    {connectLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle size={16} className="mr-2" />}
                    J'ai lié mon appareil
                  </Button>
                </div>
              </>
            )}

            {/* Step: Cloud API */}
            {connectStep === 'cloud_api' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Key size={20} className="text-purple-400" /> Configuration Cloud API
                </h3>
                <p className="text-sm text-muted-foreground mb-6">Entrez vos identifiants Meta Business</p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Phone Number ID *</Label>
                    <Input placeholder="123456789012345" value={cloudApiForm.phoneNumberId} onChange={(e) => setCloudApiForm({...cloudApiForm, phoneNumberId: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <Label>Access Token *</Label>
                    <Input type="password" placeholder="EAAxxxxxxx..." value={cloudApiForm.accessToken} onChange={(e) => setCloudApiForm({...cloudApiForm, accessToken: e.target.value})} />
                  </div>

                  <div className="space-y-2">
                    <Label>Business Account ID (optionnel)</Label>
                    <Input placeholder="123456789012345" value={cloudApiForm.businessAccountId} onChange={(e) => setCloudApiForm({...cloudApiForm, businessAccountId: e.target.value})} />
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1 text-sm">
                      Obtenez vos identifiants sur Meta Developers <ExternalLink size={12} />
                    </a>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" className="flex-1" onClick={() => setConnectStep('choose')}>Retour</Button>
                  <Button className="flex-1 btn-primary-glow" onClick={handleConfigureCloudAPI} disabled={connectLoading || !cloudApiForm.phoneNumberId || !cloudApiForm.accessToken}>
                    {connectLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle size={16} className="mr-2" />}
                    Configurer
                  </Button>
                </div>
              </>
            )}

            {/* Step: Success */}
            {connectStep === 'success' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Connexion réussie !</h3>
                <p className="text-sm text-muted-foreground mb-6">Votre WhatsApp est maintenant connecté.</p>
                <Button className="btn-primary-glow" onClick={handleCloseConnect}>Fermer</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4">Modifier: {editingTemplate}</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea value={templateForm.message_template} onChange={(e) => setTemplateForm({...templateForm, message_template: e.target.value})} rows={10} className="font-mono text-sm" />
              </div>

              <div className="space-y-2">
                <Label>Validite (minutes)</Label>
                <Input type="number" min="1" max="60" value={templateForm.validity_minutes} onChange={(e) => setTemplateForm({...templateForm, validity_minutes: parseInt(e.target.value) || 10})} />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setEditingTemplate(null)}>Annuler</Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleSaveTemplate}><Save size={16} className="mr-2" />Enregistrer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Validation Modal */}
      {showValidateModal && validateConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg animate-scale-in">

            {validateStep === 'send' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <CheckCircle size={20} className="text-green-400" /> Valider la configuration
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Envoyez un code OTP test pour verifier que <strong>{validateConfig.name}</strong> fonctionne correctement.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Numero de telephone destinataire</Label>
                    <Input
                      data-testid="validate-phone-input"
                      placeholder="+237695125262"
                      value={validatePhone}
                      onChange={(e) => setValidatePhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Entrez le numero complet avec l'indicatif pays</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" className="flex-1" onClick={() => setShowValidateModal(false)}>Annuler</Button>
                  <Button
                    className="flex-1 btn-primary-glow"
                    onClick={handleSendValidationCode}
                    disabled={validateLoading || !validatePhone}
                    data-testid="send-validation-btn"
                  >
                    {validateLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Send size={16} className="mr-2" />}
                    Envoyer le code
                  </Button>
                </div>
              </>
            )}

            {validateStep === 'confirm' && (
              <>
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                  <MessageCircle size={20} className="text-blue-400" /> Code envoye
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Un code a 6 chiffres a ete envoye au <strong>{validatePhone}</strong> via WhatsApp.
                  Entrez-le ci-dessous pour confirmer la reception.
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Code recu</Label>
                    <Input
                      data-testid="validate-code-input"
                      placeholder="123456"
                      value={validateCode}
                      onChange={(e) => setValidateCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      maxLength={6}
                      className="text-center text-2xl font-mono tracking-widest"
                    />
                  </div>

                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                    <p className="text-xs text-blue-400">
                      <Info size={12} className="inline mr-1" />
                      Verifiez WhatsApp sur le telephone associe au numero {validatePhone}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setValidateStep('send')}>Renvoyer</Button>
                  <Button
                    className="flex-1 btn-primary-glow"
                    onClick={handleConfirmValidation}
                    disabled={validateLoading || validateCode.length < 6}
                    data-testid="confirm-validation-btn"
                  >
                    {validateLoading ? <Loader2 size={16} className="mr-2 animate-spin" /> : <CheckCircle size={16} className="mr-2" />}
                    Code recu - Valider
                  </Button>
                </div>
              </>
            )}

            {validateStep === 'success' && (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Configuration validee !</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  L'envoi de messages WhatsApp fonctionne correctement pour <strong>{validateConfig.name}</strong>.
                </p>
                <Button className="btn-primary-glow" onClick={() => setShowValidateModal(false)} data-testid="close-validation-btn">Fermer</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SMS Provider Modal */}
      {showSmsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl my-8 animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Smartphone className="text-blue-400" />
              {selectedSmsProvider ? 'Modifier le fournisseur SMS' : 'Ajouter une API SMS'}
            </h3>

            {/* Service Type Selection */}
            <div className="mb-6">
              <Label className="text-sm text-muted-foreground mb-3 block">Type de service</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`p-4 rounded-xl border text-left transition-all ${
                    smsForm.service_type === 'internal' 
                      ? 'border-green-500 bg-green-500/10' 
                      : 'border-border hover:bg-secondary/30'
                  }`}
                  onClick={() => setSmsForm({...smsForm, service_type: 'internal'})}
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="text-green-400" size={24} />
                    <div>
                      <p className="font-medium text-foreground">Service Interne</p>
                      <p className="text-xs text-muted-foreground">WhatsApp configuré</p>
                    </div>
                  </div>
                </button>
                <button
                  className={`p-4 rounded-xl border text-left transition-all ${
                    smsForm.service_type === 'external' 
                      ? 'border-blue-500 bg-blue-500/10' 
                      : 'border-border hover:bg-secondary/30'
                  }`}
                  onClick={() => setSmsForm({...smsForm, service_type: 'external'})}
                >
                  <div className="flex items-center gap-3">
                    <ExternalLink className="text-blue-400" size={24} />
                    <div>
                      <p className="font-medium text-foreground">API Externe</p>
                      <p className="text-xs text-muted-foreground">Twilio, Nexmo, etc.</p>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Provider Selection for External */}
            {smsForm.service_type === 'external' && !selectedSmsProvider && (
              <div className="mb-6">
                <Label className="text-sm text-muted-foreground mb-3 block">Choisir un fournisseur</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {availableProviders.external_providers?.map((p) => (
                    <button
                      key={p.code}
                      className={`p-3 rounded-lg border text-left text-sm transition-all ${
                        smsForm.provider_code === p.code 
                          ? 'border-primary bg-primary/10' 
                          : 'border-border hover:bg-secondary/30'
                      }`}
                      onClick={() => handleSelectProviderTemplate(p)}
                    >
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom du fournisseur *</Label>
                  <Input
                    placeholder="Ex: Twilio, Orange SMS"
                    value={smsForm.provider_name}
                    onChange={(e) => setSmsForm({...smsForm, provider_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code unique *</Label>
                  <Input
                    placeholder="Ex: TWILIO, ORANGE_SMS"
                    value={smsForm.provider_code}
                    onChange={(e) => setSmsForm({...smsForm, provider_code: e.target.value.toUpperCase()})}
                    disabled={!!selectedSmsProvider}
                  />
                </div>
              </div>

              {smsForm.service_type === 'external' && (
                <>
                  <div className="space-y-2">
                    <Label>URL de base API</Label>
                    <Input
                      placeholder="https://api.provider.com/v1"
                      value={smsForm.api_base_url}
                      onChange={(e) => setSmsForm({...smsForm, api_base_url: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Clé API</Label>
                      <Input
                        placeholder="API Key"
                        value={smsForm.api_key}
                        onChange={(e) => setSmsForm({...smsForm, api_key: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Secret API</Label>
                      <Input
                        type="password"
                        placeholder="API Secret"
                        value={smsForm.api_secret}
                        onChange={(e) => setSmsForm({...smsForm, api_secret: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Account SID (Twilio)</Label>
                      <Input
                        placeholder="AC..."
                        value={smsForm.account_sid}
                        onChange={(e) => setSmsForm({...smsForm, account_sid: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Auth Token</Label>
                      <Input
                        type="password"
                        placeholder="Token"
                        value={smsForm.auth_token}
                        onChange={(e) => setSmsForm({...smsForm, auth_token: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Sender ID / Numéro expéditeur</Label>
                    <Input
                      placeholder="MonityWorld ou +123456789"
                      value={smsForm.sender_id}
                      onChange={(e) => setSmsForm({...smsForm, sender_id: e.target.value})}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label>Pays assignés</Label>
                <Select 
                  value={smsForm.countries.length > 0 ? smsForm.countries[0] : 'all'} 
                  onValueChange={(v) => setSmsForm({...smsForm, countries: v === 'all' ? [] : [v]})}
                >
                  <SelectTrigger><SelectValue placeholder="Tous les pays" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all"><Globe size={14} className="inline mr-2" />Tous les pays</SelectItem>
                    {countries.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Priorité</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={smsForm.priority}
                    onChange={(e) => setSmsForm({...smsForm, priority: parseInt(e.target.value) || 1})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Coût/SMS</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={smsForm.cost_per_sms}
                    onChange={(e) => setSmsForm({...smsForm, cost_per_sms: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Devise</Label>
                  <Select value={smsForm.currency} onValueChange={(v) => setSmsForm({...smsForm, currency: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="XAF">XAF</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label>Actif</Label>
                    <Switch 
                      checked={smsForm.is_active} 
                      onCheckedChange={(v) => setSmsForm({...smsForm, is_active: v})} 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Par défaut</Label>
                    <Switch 
                      checked={smsForm.is_default} 
                      onCheckedChange={(v) => setSmsForm({...smsForm, is_default: v})} 
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setShowSmsModal(false); resetSmsForm(); }}>
                Annuler
              </Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleSaveSmsProvider}>
                <Save size={16} className="mr-2" /> Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit SMTP Modal */}
      {showSmtpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl my-8 animate-scale-in">
            <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Send className="text-indigo-400" />
              {selectedSmtpConfig ? 'Modifier la connexion SMTP' : 'Ajouter une connexion SMTP'}
            </h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom de la connexion *</Label>
                  <Input
                    placeholder="Ex: Gmail principal, SendGrid RDC"
                    value={smtpForm.provider_name}
                    onChange={(e) => setSmtpForm({...smtpForm, provider_name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code unique *</Label>
                  <Input
                    placeholder="Ex: GMAIL_MAIN, SENDGRID_CD"
                    value={smtpForm.provider_code}
                    onChange={(e) => setSmtpForm({...smtpForm, provider_code: e.target.value.toUpperCase()})}
                    disabled={!!selectedSmtpConfig}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Hôte SMTP *</Label>
                  <Input
                    placeholder="smtp.gmail.com"
                    value={smtpForm.host}
                    onChange={(e) => setSmtpForm({...smtpForm, host: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    type="number"
                    value={smtpForm.port}
                    onChange={(e) => setSmtpForm({...smtpForm, port: parseInt(e.target.value) || 587})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Utilisateur SMTP *</Label>
                  <Input
                    placeholder="votre-compte@gmail.com"
                    value={smtpForm.username}
                    onChange={(e) => setSmtpForm({...smtpForm, username: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mot de passe {selectedSmtpConfig ? '(laisser vide pour garder l\'actuel)' : '*'}</Label>
                  <Input
                    type="password"
                    placeholder="Mot de passe ou clé API"
                    value={smtpForm.password}
                    onChange={(e) => setSmtpForm({...smtpForm, password: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adresse d'expédition *</Label>
                  <Input
                    placeholder="no-reply@monityworld.win"
                    value={smtpForm.from_email}
                    onChange={(e) => setSmtpForm({...smtpForm, from_email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nom d'expéditeur</Label>
                  <Input
                    placeholder="Monity World"
                    value={smtpForm.from_name}
                    onChange={(e) => setSmtpForm({...smtpForm, from_name: e.target.value})}
                  />
                </div>
              </div>

              {/* "For all states" selector */}
              <div className="space-y-2">
                <Label>Portée de la connexion</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`p-3 rounded-lg border text-left text-sm transition-all ${
                      smtpForm.is_all_states
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-secondary/30'
                    }`}
                    onClick={() => setSmtpForm({...smtpForm, is_all_states: true, countries: []})}
                  >
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Pour tous les états</p>
                        <p className="text-xs text-muted-foreground">Connexion de secours utilisée quand celle d'un pays est indisponible</p>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`p-3 rounded-lg border text-left text-sm transition-all ${
                      !smtpForm.is_all_states
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-secondary/30'
                    }`}
                    onClick={() => setSmtpForm({...smtpForm, is_all_states: false})}
                  >
                    <div className="flex items-center gap-2">
                      <Phone size={16} className="text-primary" />
                      <div>
                        <p className="font-medium text-foreground">Pays spécifiques</p>
                        <p className="text-xs text-muted-foreground">Choisissez un ou plusieurs pays ci-dessous</p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {!smtpForm.is_all_states && (
                <div className="space-y-2">
                  <Label>Pays assignés</Label>
                  <Select
                    value={smtpForm.countries.length > 0 ? smtpForm.countries[0] : 'all'}
                    onValueChange={(v) => setSmtpForm({...smtpForm, countries: v === 'all' ? [] : [v]})}
                  >
                    <SelectTrigger><SelectValue placeholder="Tous les pays" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all"><Globe size={14} className="inline mr-2" />Tous les pays</SelectItem>
                      {countries.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.flag} {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priorité</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={smtpForm.priority}
                    onChange={(e) => setSmtpForm({...smtpForm, priority: parseInt(e.target.value) || 1})}
                  />
                </div>
                <div className="flex items-end pb-1">
                  <div className="flex items-center gap-2">
                    <Label>Utiliser TLS</Label>
                    <Switch
                      checked={smtpForm.use_tls}
                      onCheckedChange={(v) => setSmtpForm({...smtpForm, use_tls: v})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label>Actif</Label>
                    <Switch
                      checked={smtpForm.is_active}
                      onCheckedChange={(v) => setSmtpForm({...smtpForm, is_active: v})}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Par défaut</Label>
                    <Switch
                      checked={smtpForm.is_default}
                      onCheckedChange={(v) => setSmtpForm({...smtpForm, is_default: v})}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => { setShowSmtpModal(false); resetSmtpForm(); }}>
                Annuler
              </Button>
              <Button className="flex-1 btn-primary-glow" onClick={handleSaveSmtpConfig}>
                <Save size={16} className="mr-2" /> Enregistrer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Config Card Component
function WhatsAppConfigCard({ config, countries, onConnect, onDisconnect, onEdit, onDelete, onValidate, getStatusBadge, isSupport }) {
  const [showTestOtp, setShowTestOtp] = useState(false);
  const [showCloudApiTest, setShowCloudApiTest] = useState(false);
  const [testCountry, setTestCountry] = useState('+243');
  const [testNumber, setTestNumber] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState(null);
  
  // Cloud API test state
  const [cloudApiPhone, setCloudApiPhone] = useState('');
  const [cloudApiMessage, setCloudApiMessage] = useState('Test message depuis Monity World');
  const [cloudApiTesting, setCloudApiTesting] = useState(false);
  const [cloudApiResult, setCloudApiResult] = useState(null);

  const countryNames = config.countries?.map(code => {
    if (code === '*') return 'Tous les pays';
    const country = countries.find(c => c.code === code);
    return country ? `${country.flag || ''} ${country.name}` : code;
  }).join(', ') || 'Non defini';

  const isConnected = config.connection_status === 'ready';
  const isValidated = config.validated;
  const hasCloudApi = config.cloud_api_config?.phone_number_id && config.cloud_api_config?.access_token;

  const handleSendTestOtp = async () => {
    const fullPhone = testCountry + testNumber;
    if (!testNumber || testNumber.length < 6) {
      setTestResult({ type: 'error', msg: 'Entrez un numero valide' });
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${config.id}/validate-send`, {
        phone: fullPhone
      });
      if (res.data.success) {
        setTestResult({ type: 'success', msg: `OTP envoye au ${fullPhone}` });
      } else {
        setTestResult({ type: 'error', msg: res.data.error || 'Echec de l\'envoi' });
      }
    } catch (err) {
      setTestResult({ type: 'error', msg: err.response?.data?.detail || err.response?.data?.error || 'Erreur' });
    } finally {
      setTestSending(false);
    }
  };

  const handleTestCloudApi = async () => {
    if (!cloudApiPhone || cloudApiPhone.length < 10) {
      setCloudApiResult({ type: 'error', msg: 'Entrez un numero valide (format international)' });
      return;
    }
    setCloudApiTesting(true);
    setCloudApiResult(null);
    try {
      const res = await API.post(`/admin/whatsapp/configs/${config.id}/test-cloud-api`, {
        phone_number: cloudApiPhone,
        message: cloudApiMessage
      });
      if (res.data.success) {
        setCloudApiResult({ type: 'success', msg: `Message envoye! ID: ${res.data.message_id}` });
      } else {
        setCloudApiResult({ type: 'error', msg: res.data.error || 'Echec de l\'envoi' });
      }
    } catch (err) {
      setCloudApiResult({ type: 'error', msg: err.response?.data?.detail || err.response?.data?.error || 'Erreur' });
    } finally {
      setCloudApiTesting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSupport ? 'bg-purple-500/10' : 'bg-green-500/10'}`}>
              {isSupport ? <Headphones size={20} className="text-purple-400" /> : <MessageCircle size={20} className="text-green-400" />}
            </div>
            <div>
              <h4 className="font-semibold text-foreground">{config.name}</h4>
              <p className="text-xs text-muted-foreground">{config.session_id}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {getStatusBadge(config.connection_status)}
            {config.is_default && <Badge variant="outline">Par defaut</Badge>}
            {isValidated && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Valide</Badge>}
            {hasCloudApi && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Cloud API</Badge>}
          </div>

          <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
            <Globe size={14} />
            <span>{countryNames}</span>
          </div>

          {config.connection_info?.wid && (
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Phone size={14} />
              <span>{config.connection_info.wid}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {isConnected ? (
            <>
              <Button variant="outline" size="sm" onClick={() => onDisconnect(config)} className="text-red-400 hover:text-red-300">
                <XCircle size={14} className="mr-1" /> Deconnecter
              </Button>
              <Button size="sm" onClick={() => onValidate(config)} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid={`validate-config-${config.id}`}>
                <CheckCircle size={14} className="mr-1" /> Valider
              </Button>
              <Button size="sm" variant={showTestOtp ? "secondary" : "outline"} onClick={() => { setShowTestOtp(!showTestOtp); setShowCloudApiTest(false); setTestResult(null); }} data-testid={`test-otp-toggle-${config.id}`}>
                <Send size={14} className="mr-1" /> Test OTP
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => onConnect(config)} className="btn-primary-glow">
              <Link size={14} className="mr-1" /> Connecter
            </Button>
          )}
          {hasCloudApi && (
            <Button size="sm" variant={showCloudApiTest ? "secondary" : "outline"} onClick={() => { setShowCloudApiTest(!showCloudApiTest); setShowTestOtp(false); setCloudApiResult(null); }} className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400" data-testid={`test-cloud-api-${config.id}`}>
              <ExternalLink size={14} className="mr-1" /> Test Cloud API
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit(config)}>
            <Edit2 size={14} className="mr-1" /> Modifier
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(config.id)} className="text-red-400 hover:text-red-300">
            <Trash2 size={14} className="mr-1" /> Supprimer
          </Button>
        </div>
      </div>

      {/* Test OTP inline form */}
      {isConnected && showTestOtp && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Send size={14} className="text-green-400" /> Envoyer un OTP test
          </p>
          <div className="flex items-end gap-2">
            <div className="w-40">
              <Label className="text-xs text-muted-foreground mb-1 block">Pays</Label>
              <Select value={testCountry} onValueChange={setTestCountry}>
                <SelectTrigger className="h-9" data-testid={`test-otp-country-${config.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.dial_code}>
                      {c.flag} {c.dial_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-1 block">Numero</Label>
              <Input
                className="h-9"
                placeholder="695125262"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value.replace(/[^0-9]/g, ''))}
                data-testid={`test-otp-number-${config.id}`}
              />
            </div>
            <Button
              size="sm"
              className="h-9 bg-green-600 hover:bg-green-700 text-white px-4"
              onClick={handleSendTestOtp}
              disabled={testSending || !testNumber}
              data-testid={`test-otp-send-${config.id}`}
            >
              {testSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span className="ml-1.5">{testSending ? 'Envoi...' : 'Test'}</span>
            </Button>
          </div>
          {testResult && (
            <div className={`mt-2 text-sm flex items-center gap-1.5 ${testResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`} data-testid={`test-otp-result-${config.id}`}>
              {testResult.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {testResult.msg}
            </div>
          )}
        </div>
      )}

      {/* Test Cloud API form */}
      {hasCloudApi && showCloudApiTest && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <ExternalLink size={14} className="text-blue-400" /> Tester l'API WhatsApp Cloud (Meta Business)
          </p>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Numero de telephone (format international)</Label>
              <Input
                className="h-9"
                placeholder="+243695125262"
                value={cloudApiPhone}
                onChange={(e) => setCloudApiPhone(e.target.value)}
                data-testid={`cloud-api-phone-${config.id}`}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Message</Label>
              <Input
                className="h-9"
                placeholder="Test message"
                value={cloudApiMessage}
                onChange={(e) => setCloudApiMessage(e.target.value)}
                data-testid={`cloud-api-message-${config.id}`}
              />
            </div>
            <Button
              size="sm"
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white px-4"
              onClick={handleTestCloudApi}
              disabled={cloudApiTesting || !cloudApiPhone}
              data-testid={`cloud-api-send-${config.id}`}
            >
              {cloudApiTesting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span className="ml-1.5">{cloudApiTesting ? 'Envoi...' : 'Envoyer via Cloud API'}</span>
            </Button>
          </div>
          {cloudApiResult && (
            <div className={`mt-3 p-3 rounded-lg ${cloudApiResult.type === 'success' ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
              <div className={`text-sm flex items-center gap-1.5 ${cloudApiResult.type === 'success' ? 'text-green-400' : 'text-red-400'}`} data-testid={`cloud-api-result-${config.id}`}>
                {cloudApiResult.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {cloudApiResult.msg}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
