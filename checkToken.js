// checkToken.js
import jwt from 'jsonwebtoken';

// Tu JWT de prueba (el que tienes en localStorage)
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZW1haWwiOiJlZHlAZ21haWwuY29tIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3NTcyNjg1NTcsImV4cCI6MTc1Nzg3MzM1N30.571DG6bJl_cFUDnPCrCBGj-skmfCPDmaqT-Z0PfppuY';

// Tu secreto JWT local
const secret = 'change_this_jwt_secret';

try {
  const decoded = jwt.verify(token, secret);
  console.log('✅ Token válido!');
  console.log('Payload:', decoded);
} catch (err) {
  console.error('❌ Token inválido o expirado');
  console.error(err.message);
}
