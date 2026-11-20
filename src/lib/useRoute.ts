import { useCallback, useEffect, useState } from 'react';

export type Route = 'inicio' | 'clasificacion' | 'partidos' | 'estadisticas' | 'jugador' | 'admin';
const ROUTES: Route[] = ['inicio', 'clasificacion', 'partidos', 'estadisticas', 'jugador', 'admin'];

export interface Location {
  route: Route;
  /** Parámetro opcional, p. ej. el id del jugador en #/jugador/<id>. */
  param: string | null;
}

function parse(hash: string): Location {
  const [raw, param] = hash.replace(/^#\/?/, '').split('?')[0].split('/');
  // «calendario» era la pestaña de antes: ahora sus partidos están en «partidos».
  const route = raw === 'calendario' ? 'partidos' : raw;
  return ROUTES.includes(route as Route) ? { route: route as Route, param: param || null } : { route: 'inicio', param: null };
}

/** Navegación por #/ruta, que funciona en GitHub Pages sin configurar el servidor. */
export function useRoute(): [Location, (route: Route, param?: string) => void] {
  const [location, setLocation] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setLocation(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((route: Route, param?: string) => {
    window.location.hash = param ? `/${route}/${param}` : `/${route}`;
  }, []);
  return [location, navigate];
}
