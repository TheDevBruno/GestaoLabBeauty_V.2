import { LoadingScreen } from './LoadingScreen';

// HydrateFallback das rotas: aparece na primeira carga, enquanto o chunk da página chega.
export function RouteFallback() {
  return <LoadingScreen title="LabBeautyPro" />;
}
