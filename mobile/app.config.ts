import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Configuração nativa (CNG: ios/ e android/ são gerados no build).
 * Variáveis por perfil em eas.json / ambiente EAS:
 *  APP_VARIANT                 development | preview | production
 *  EXPO_PUBLIC_API_URL         API do OpenDriver, ex.: https://api-app.opendriver.com.br
 *  EXPO_PUBLIC_HUB_URL         site do OpenDriverHub (aba Hub — RF11)
 *  EXPO_PUBLIC_HUB_API_URL     API do hub — usada só para enviar a foto de perfil
 *  EXPO_PUBLIC_MAP_STYLE_URL   estilo MapLibre (tiles OSM próprios/provedor)
 *  EAS_PROJECT_ID              necessário para push (Expo)
 */
const VARIANT = (process.env.APP_VARIANT ?? 'development') as 'development' | 'preview' | 'production';
const IS_PROD = VARIANT === 'production';
const SUFFIX = IS_PROD ? '' : VARIANT === 'preview' ? '.preview' : '.dev';
const BUNDLE_ID = process.env.IOS_BUNDLE_ID ?? 'br.com.opendriver.app';
const PACKAGE = process.env.ANDROID_PACKAGE ?? 'br.com.opendriver.app';
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const HUB_URL = (process.env.EXPO_PUBLIC_HUB_URL ?? 'https://opendriver.com.br').replace(/\/+$/, '');
/**
 * API do hub. O avatar e publico e ja e LIDO do hub, entao e para la que ele e enviado: o
 * storage do opendriver e privado e cifrado, feito para documento de motorista.
 */
const HUB_API_URL = (process.env.EXPO_PUBLIC_HUB_API_URL ?? 'https://hubapi.opendriver.com.br').replace(/\/+$/, '');
const MAP_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL ?? '';

if (VARIANT !== 'development') {
  const problems: string[] = [];
  if (!/^https:\/\//.test(API_URL)) problems.push(`EXPO_PUBLIC_API_URL deve ser https (recebido: "${API_URL}")`);
  if (!/^https:\/\//.test(HUB_URL)) problems.push('EXPO_PUBLIC_HUB_URL deve ser https');
  // A foto sobe com o token da sessao no cabecalho; em http ele iria em texto claro.
  if (!/^https:\/\//.test(HUB_API_URL)) problems.push('EXPO_PUBLIC_HUB_API_URL deve ser https');
  if (!/^https:\/\//.test(MAP_STYLE_URL)) problems.push('EXPO_PUBLIC_MAP_STYLE_URL deve apontar para um estilo MapLibre https (tiles próprios)');
  if (problems.length) throw new Error(`Configuração inválida para o build "${VARIANT}":\n- ${problems.join('\n- ')}`);
}

const NAVY = '#0A1726';
/** Fundo do ícone do aplicativo, igual ao da logo enviada à ficha da Play. */
const FUNDO_DO_ICONE = '#000000';
const LOCATION_WHEN_IN_USE =
  'Usamos sua localização para definir o ponto de embarque e mostrar o motorista a caminho.';
const LOCATION_ALWAYS =
  'Motoristas online compartilham a localização mesmo com o app em segundo plano, para receber corridas próximas e mostrar o trajeto ao passageiro. Fique offline para parar.';
const MICROPHONE =
  'Com a gravação de segurança ativada por você, o áudio das viagens é gravado, criptografado e guardado por 30 dias.';
const CAMERA = 'A câmera é usada para fotografar sua CNH, sua selfie e o documento do veículo no cadastro de motorista.';
const PHOTOS = 'Suas fotos são usadas para enviar os documentos do cadastro de motorista.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_PROD ? 'OpenDriver' : `OpenDriver (${VARIANT === 'preview' ? 'Preview' : 'Dev'})`,
  slug: 'opendriver',
  owner: process.env.EAS_OWNER || undefined,
  scheme: 'opendriver',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#F7F9FB',
  runtimeVersion: { policy: 'appVersion' },
  ios: {
    bundleIdentifier: `${BUNDLE_ID}${SUFFIX}`,
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleDevelopmentRegion: 'pt-BR',
      // location: motorista online em 2º plano (RF06); audio: gravação de segurança (RF16).
      UIBackgroundModes: ['location', 'audio', 'remote-notification'],
      LSApplicationQueriesSchemes: ['waze', 'comgooglemaps', 'whatsapp', 'tel', 'sms'],
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] },
        { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
      ],
    },
  },
  android: {
    package: `${PACKAGE}${SUFFIX}`,
    /**
     * O Play recusa upload com `versionCode` já usado, e o template do prebuild grava `1`
     * fixo em `android/app/build.gradle` quando este campo não existe — passar
     * `-PversionCode` ao gradle não muda nada, porque o template não lê essa propriedade.
     * Por isso o valor mora aqui.
     *
     * 1 = primeiro envio (faixa interna). 2 = correção das permissões de serviço em primeiro
     * plano: `RECORD_AUDIO` estava sendo removida por conflito de plugin, e
     * `FOREGROUND_SERVICE_MEDIA_PLAYBACK` era declarada sem o app nunca tocar áudio.
     */
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 3),
    adaptiveIcon: {
      /**
       * Preto, e não o navy da marca: o ícone definido na ficha da Play é o avião branco
       * sobre fundo preto, e o fundo do ícone adaptativo é o que o lançador do Android
       * desenha atrás do avião. Com navy aqui, o ícone na gaveta de aplicativos sairia
       * diferente do que aparece na loja.
       *
       * `NAVY` continua valendo para a tela de abertura e para a cor da notificação.
       */
      backgroundColor: FUNDO_DO_ICONE,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
    ],
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW'],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    ['expo-secure-store', { faceIDPermission: false, configureAndroidBackup: true }],
    'expo-asset',
    'expo-image',
    'expo-web-browser',
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 180, resizeMode: 'contain', backgroundColor: NAVY }],
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_WHEN_IN_USE,
        locationAlwaysAndWhenInUsePermission: LOCATION_ALWAYS,
        locationAlwaysPermission: LOCATION_ALWAYS,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    /**
     * `enableBackgroundPlayback: false` é obrigatório aqui. O padrão do plugin é `true`, e
     * com ele o manifesto ganha `FOREGROUND_SERVICE_MEDIA_PLAYBACK` mais o serviço
     * `expo.modules.audio.service.AudioControlsService`. Este app **nunca toca áudio** — só
     * grava, e só com opt-in, durante a viagem. O Play exige justificar cada permissão de
     * serviço em primeiro plano com uma demonstração em vídeo, e declarar reprodução de mídia
     * que não existe é declaração falsa. Com `false`, o plugin remove o serviço junto com a
     * permissão.
     */
    [
      'expo-audio',
      {
        microphonePermission: MICROPHONE,
        recordAudioAndroid: true,
        enableBackgroundRecording: true,
        enableBackgroundPlayback: false,
      },
    ],
    /**
     * `microphonePermission` **não pode ser `false`** aqui, por mais que o seletor de imagem
     * não use microfone nenhum. O plugin do expo-image-picker trata `false` como
     * `blockedPermissions`, e `tools:node="remove"` vence a fusão de manifestos: o resultado
     * era um APK/AAB com `FOREGROUND_SERVICE_MICROPHONE` e o serviço de gravação presentes,
     * mas **sem `RECORD_AUDIO`** — a gravação de segurança (RF16) não tinha como funcionar no
     * Android, e o app pedia ao Play uma permissão de serviço que ele não conseguiria usar.
     * Passar a mesma descrição do expo-audio mantém o texto em pt-BR no iOS e deixa a
     * permissão intacta no Android.
     */
    ['expo-image-picker', { photosPermission: PHOTOS, cameraPermission: CAMERA, microphonePermission: MICROPHONE }],
    ['expo-notifications', { icon: './assets/android-icon-monochrome.png', color: NAVY }],
    '@maplibre/maplibre-react-native',
  ],
  experiments: { typedRoutes: true },
  extra: {
    variant: VARIANT,
    apiUrl: API_URL,
    hubUrl: HUB_URL,
    hubApiUrl: HUB_API_URL,
    mapStyleUrl: MAP_STYLE_URL,
    router: {},
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
