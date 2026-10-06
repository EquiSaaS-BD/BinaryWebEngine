import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAs474_w_P2sTSbNWxB4-0aIGnZ7JLVHeA",
  authDomain: "binarywebengine-8133d.firebaseapp.com",
  projectId: "binarywebengine-8133d",
  storageBucket: "binarywebengine-8133d.firebasestorage.app",
  messagingSenderId: "120446431663",
  appId: "1:120446431663:web:b3202943538ac3c4f13f5a",
  measurementId: "G-5BPH1R0TP9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
