// ============================================================
// firebase.js
// Configuración y conexión a Firebase Firestore.
// Este archivo es la "llave" de la base de datos.
// Todos los demás módulos importan db y las funciones de aquí.
// ============================================================

// Importar Firebase desde la CDN oficial (no requiere npm)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,  // referencia a una colección (tabla)
  doc,         // referencia a un documento específico
  addDoc,      // agregar documento nuevo
  updateDoc,   // actualizar documento existente
  setDoc,      // crear/sobreescribir documento con ID fijo
  deleteDoc,   // eliminar documento
  getDocs,     // obtener múltiples documentos
  query,       // construir consultas
  orderBy,     // ordenar resultados
  serverTimestamp, // fecha/hora del servidor automática
  where,       // filtrar documentos
  writeBatch,  // operaciones en lote (para borrar muchos a la vez)
  getDoc       // obtener un solo documento
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Configuración del proyecto Firebase ──────────────────────
// Estos datos identifican el proyecto "sistema-seguros-vencimientos"
const app = initializeApp({
  apiKey:            "AIzaSyBgbnth2YSSgX2-DJqbms_SdNTZYDdH5UI",
  authDomain:        "sistema-seguros-vencimientos.firebaseapp.com",
  projectId:         "sistema-seguros-vencimientos",
  storageBucket:     "sistema-seguros-vencimientos.firebasestorage.app",
  messagingSenderId: "446215450096",
  appId:             "1:446215450096:web:871b241b2eab7864f78135"
});

// ── Instancia de la base de datos ────────────────────────────
// "db" es el objeto principal que usan todos los módulos
// para leer y escribir datos en Firestore
export const db = getFirestore(app);

// ── Re-exportar todas las funciones de Firestore ─────────────
// Así cada módulo importa solo desde aquí y no desde la CDN directamente
export {
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  where,
  writeBatch,
  getDoc
};
