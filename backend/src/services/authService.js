'use strict';

const jwt = require('jsonwebtoken');
const { noAutorizado, validacion } = require('../domain/errors');

function crearAuthService({ verificarCredenciales, jwtSecret, expiresIn = '8h' }) {
  if (!jwtSecret) throw new Error('JWT_SECRET es obligatorio');

  return {
    async login(email, password) {
      if (!email || !password) throw validacion('Correo y contraseña son obligatorios');
      const ok = await verificarCredenciales(String(email).trim().toLowerCase(), String(password));
      if (!ok) throw noAutorizado('Correo o contraseña incorrectos');
      const token = jwt.sign({ sub: String(email).toLowerCase(), role: 'admin' }, jwtSecret, { expiresIn });
      return { token, expiresIn };
    },

    verificarToken(token) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        if (payload.role !== 'admin') throw new Error('rol');
        return payload;
      } catch {
        throw noAutorizado();
      }
    },
  };
}

function credencialesDemo(email, password) {
  return async (e, p) => e === email.toLowerCase() && p === password;
}

function credencialesSupabase(clienteAnon) {
  return async (email, password) => {
    const { data, error } = await clienteAnon.auth.signInWithPassword({ email, password });
    if (error || !data?.user) return false;
    return data.user.app_metadata?.role === 'admin';
  };
}

module.exports = { crearAuthService, credencialesDemo, credencialesSupabase };
