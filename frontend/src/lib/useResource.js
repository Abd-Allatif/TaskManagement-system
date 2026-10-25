import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async loader and tracks loading/error state. The loader receives an
 * AbortSignal so in-flight requests are cancelled when deps change or the
 * component unmounts.
 */
export function useResource(loader, deps = [], { onError, enabled = true } = {}) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: Boolean(enabled),
  });
  const [nonce, setNonce] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    Promise.resolve()
      .then(() => loaderRef.current(controller.signal))
      .then((data) => {
        if (active) setState({ data, error: null, loading: false });
      })
      .catch((err) => {
        if (!active || err?.name === "AbortError") return;
        setState({ data: null, error: err, loading: false });
        onErrorRef.current?.(err);
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const patch = useCallback((data) => {
    setState({ data, error: null, loading: false });
  }, []);

  return { ...state, reload, patch };
}

/** Wraps a write operation with pending/error state. */
export function useMutation(fn) {
  const [state, setState] = useState({ loading: false, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async (...args) => {
    setState({ loading: true, error: null });
    try {
      const result = await fnRef.current(...args);
      setState({ loading: false, error: null });
      return result;
    } catch (err) {
      setState({ loading: false, error: err });
      throw err;
    }
  }, []);

  const reset = useCallback(() => setState({ loading: false, error: null }), []);

  return { ...state, run, reset };
}
