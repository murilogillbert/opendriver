import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { tokenStorage } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingState } from '@/components/ui/States';
import { env } from '@/config/env';
import { colors } from '@/theme/tokens';

/**
 * Aba Hub (RF11, UX05): o OpenDriverHub já logado, sem novo login. A sessão
 * vai para o localStorage do site (mesmas chaves do hub web) antes de a
 * página carregar — e só na origem do hub.
 */
function sessionScript(token: string, refresh: string): string {
  const origin = JSON.stringify(env.hubOrigin);
  return `(function(){try{if(window.location.origin===${origin}){localStorage.setItem('odh.token',${JSON.stringify(token)});localStorage.setItem('odh.refresh',${JSON.stringify(refresh)});}}catch(e){}})();true;`;
}

const isHub = (url: string) => url === env.hubOrigin || url.startsWith(`${env.hubOrigin}/`);

export function HubScreen() {
  const [script, setScript] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState(0);
  const canGoBack = useRef(false);
  const webRef = useRef<WebView>(null);

  useEffect(() => {
    void Promise.all([tokenStorage.getAccessToken(), tokenStorage.getRefreshToken()]).then(([t, r]) => setScript(t && r ? sessionScript(t, r) : ''));
  }, [key]);

  // Android: "voltar" navega dentro do Hub antes de sair da aba.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!canGoBack.current) return false;
        webRef.current?.goBack();
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const onNav = (e: WebViewNavigation) => {
    canGoBack.current = e.canGoBack;
  };

  if (script === null) return <LoadingState />;

  if (failed) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Não conseguimos abrir o Hub"
          message="Verifique sua internet e tente de novo."
          action={
            <Button
              title="Tentar novamente"
              icon="refresh-outline"
              variant="outline"
              onPress={() => {
                setFailed(false);
                setKey((k) => k + 1);
              }}
            />
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={{ flex: 1 }}>
        <WebView
          key={key}
          ref={webRef}
          source={{ uri: env.hubUrl }}
          injectedJavaScriptBeforeContentLoaded={script}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          sharedCookiesEnabled={false}
          startInLoadingState
          renderLoading={() => <LoadingState label="Abrindo o Hub…" />}
          pullToRefreshEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          onNavigationStateChange={onNav}
          onError={() => setFailed(true)}
          onContentProcessDidTerminate={() => webRef.current?.reload()}
          onRenderProcessGone={() => setKey((k) => k + 1)}
          // Links de fora do Hub (pagamento, redes sociais…) abrem no navegador do sistema.
          onShouldStartLoadWithRequest={(req) => {
            if (req.isTopFrame === false) return true; // iframes do próprio Hub (mapas, pagamentos)
            if (isHub(req.url) || req.url.startsWith('about:') || req.url.startsWith('blob:') || req.url.startsWith('data:')) return true;
            if (/^https?:\/\//.test(req.url)) void WebBrowser.openBrowserAsync(req.url).catch(() => undefined);
            return false;
          }}
          style={{ backgroundColor: colors.bg }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
});
