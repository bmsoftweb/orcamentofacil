import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Focus } from 'lucide-react';
import { MalhaImportacao } from '../services/api';

interface Props {
  malha: MalhaImportacao;
  /** Objetos destacados (a peça escolhida, ou todas as peças do móvel/grupo escolhido) */
  destacados: Set<number>;
  onSelecionar: (objetoId: number | null) => void;
  /** Cor por objeto (ex.: medidas repetidas na revisão); sem cor, vale a do material */
  cores?: Map<number, string>;
  /** Objetos escondidos no desenho (ex.: já classificados, na aba "A classificar"); não recebem clique */
  ocultos?: Set<number>;
}

const COR_PADRAO = '#d6cfc4';
const COR_DESTAQUE = new THREE.Color('#f59e0b');

/** base64 → Float32Array (triângulos em mm, 9 números cada) */
function decodificar(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * Visualizador 3D da importação: as peças vêm da malha gravada pelo parser (uma por instância),
 * então clicar numa peça devolve o id do objeto no banco e o destaque é exato.
 */
export const Visualizador3D: React.FC<Props> = ({ malha, destacados, onSelecionar, cores, ocultos }) => {
  const caixa = useRef<HTMLDivElement>(null);
  const estado = useRef<{ malhas: THREE.Mesh[]; enquadrar: (alvo?: THREE.Object3D[]) => void } | null>(null);
  const aoSelecionar = useRef(onSelecionar);
  aoSelecionar.current = onSelecionar;

  // Cena: montada uma vez por malha
  useEffect(() => {
    const el = caixa.current!;
    const escuro = document.documentElement.classList.contains('dark');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);

    const cena = new THREE.Scene();
    cena.background = new THREE.Color(escuro ? '#1c1917' : '#f5f5f4');
    cena.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2));
    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(1, 2, 1.5);
    cena.add(sol);

    const camera = new THREE.PerspectiveCamera(40, 1, 1, 1e6);
    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;

    // Modelo em mm; Z_UP do SketchUp vira o Y_UP do three
    const modelo = new THREE.Group();
    if (malha.eixoUp === 'Z_UP') modelo.rotation.x = -Math.PI / 2;
    if (malha.eixoUp === 'X_UP') modelo.rotation.z = Math.PI / 2;
    const malhas: THREE.Mesh[] = [];
    const corLinha = escuro ? 0x0c0a09 : 0x57534e;
    for (const inst of malha.instancias) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(decodificar(inst.tris), 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({ color: inst.cor || COR_PADRAO, roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      const m = new THREE.Mesh(geo, mat);
      m.userData.objeto = inst.objeto;
      m.userData.cor = mat.color.clone();
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: corLinha })));
      modelo.add(m);
      malhas.push(m);
    }
    cena.add(modelo);

    const enquadrar = (alvo: THREE.Object3D[] = [modelo]) => {
      const bb = new THREE.Box3();
      for (const o of alvo) bb.expandByObject(o);
      if (bb.isEmpty()) return;
      const centro = bb.getCenter(new THREE.Vector3());
      const raio = bb.getBoundingSphere(new THREE.Sphere()).radius || 1000;
      const dist = raio / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
      camera.position.copy(centro).add(new THREE.Vector3(0.6, 0.45, 1).normalize().multiplyScalar(dist));
      camera.near = dist / 100;
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      controles.target.copy(centro);
      controles.update();
    };
    enquadrar();

    const redimensionar = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const obs = new ResizeObserver(redimensionar);
    obs.observe(el);
    redimensionar();

    // Clique (sem arrastar) seleciona a peça; no vazio, limpa a seleção
    let inicio: { x: number; y: number } | null = null;
    const raio = new THREE.Raycaster();
    const baixar = (e: PointerEvent) => (inicio = { x: e.clientX, y: e.clientY });
    const soltar = (e: PointerEvent) => {
      if (!inicio || Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      raio.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = raio.intersectObjects(malhas.filter((m) => m.visible), false)[0];
      aoSelecionar.current(hit ? (hit.object.userData.objeto as number) : null);
    };
    renderer.domElement.addEventListener('pointerdown', baixar);
    renderer.domElement.addEventListener('pointerup', soltar);

    let quadro = 0;
    const animar = () => {
      quadro = requestAnimationFrame(animar);
      controles.update();
      renderer.render(cena, camera);
    };
    animar();
    estado.current = { malhas, enquadrar };

    return () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      controles.dispose();
      cena.traverse((o) => {
        const x = o as THREE.Mesh;
        x.geometry?.dispose();
        (Array.isArray(x.material) ? x.material : x.material ? [x.material] : []).forEach((m) => m.dispose());
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
      estado.current = null;
    };
  }, [malha]);

  // Destaque: as escolhidas em âmbar; com algo escolhido, as demais ficam translúcidas
  useEffect(() => {
    const s = estado.current;
    if (!s) return;
    for (const m of s.malhas) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const sel = destacados.has(m.userData.objeto);
      m.visible = !ocultos?.has(m.userData.objeto);
      const cor = cores?.get(m.userData.objeto);
      if (sel) mat.color.copy(COR_DESTAQUE);
      else if (cor) mat.color.set(cor);
      else mat.color.copy(m.userData.cor);
      mat.transparent = destacados.size > 0 && !sel;
      mat.opacity = mat.transparent ? 0.25 : 1;
      mat.depthWrite = !mat.transparent;
    }
  }, [destacados, malha, cores, ocultos]);

  return (
    <div className="relative w-full h-full min-h-[300px]">
      <div ref={caixa} className="absolute inset-0" />
      <button
        type="button"
        onClick={() => {
          const s = estado.current;
          if (!s) return;
          const alvo = s.malhas.filter((m) => destacados.has(m.userData.objeto));
          s.enquadrar(alvo.length ? alvo : undefined);
        }}
        title={destacados.size ? 'Enquadrar a seleção' : 'Enquadrar o modelo'}
        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 dark:bg-stone-800/90 border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:text-blue-600 cursor-pointer"
      >
        <Focus className="w-4 h-4" />
      </button>
      <div className="absolute bottom-2 left-2 text-[10px] text-stone-500 bg-white/80 dark:bg-stone-900/80 px-2 py-1 rounded">
        Arrastar: girar · botão direito: mover · roda: zoom · clique: selecionar
      </div>
    </div>
  );
};
