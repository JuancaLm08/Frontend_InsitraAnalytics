// Si cualquier fetch devuelve 401 con una URL, manda al login de la matriz
(function () {
  const _fetch = window.fetch;
  window.fetch = async (...args) => {
    const resp = await _fetch(...args);
    if (resp.status === 401) {
      try {
        const data = await resp.clone().json();
        if (data && data.redirect && window.location.pathname !== data.redirect) { 
          window.location.href = data.redirect; 
        }
      } catch (e) { /* no era JSON, ignora */ }
    }
    return resp;
  };
})();