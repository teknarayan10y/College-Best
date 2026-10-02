import * as faceapi from "@vladmandic/face-api";
import { useState, useEffect } from "react";

const MODEL_URL = "/models";
let modelsLoaded = false;
let loadingPromise = null;

export async function ensureModelsLoaded() {
  if (modelsLoaded) return true;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      modelsLoaded = true;
      console.log("[FaceAPI] Neural face recognition models loaded");
      return true;
    } catch (err) {
      loadingPromise = null;
      console.error("[FaceAPI] Model load error:", err);
      return false;
    }
  })();
  return loadingPromise;
}

/**
 * Extracts a real 128-dimensional neural face descriptor.
 * Same person ~0.3-0.5 Euclidean distance, different person >0.6.
 * Returns null if no face detected in frame.
 */
export async function extractFaceDescriptor(videoOrCanvas) {
  const ready = await ensureModelsLoaded();
  if (!ready) throw new Error("Face models failed to load. Please refresh.");

  const det = await faceapi
    .detectSingleFace(
      videoOrCanvas,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
    )
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!det) return null;
  return Array.from(det.descriptor);
}

/**
 * Euclidean distance between two 128-dim descriptors.
 * THRESHOLD: < 0.50 = same person, > 0.60 = different person
 */
export function faceDistance(d1, d2) {
  if (!d1 || !d2 || d1.length !== d2.length) return 99;
  return faceapi.euclideanDistance(new Float32Array(d1), new Float32Array(d2));
}

export function useFaceApiLoader() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ensureModelsLoaded().then(ok => {
      if (ok) setReady(true);
      else setError("Could not load face recognition models. Please refresh.");
    });
  }, []);
  return { ready, error };
}
