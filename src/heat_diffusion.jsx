import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const HeatDiffusionVisualization = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [alpha, setAlpha] = useState(0.1);
  const [L, setL] = useState(10);
  const [barType, setBarType] = useState('infinite');
  const [initialCondition, setInitialCondition] = useState('gaussian');
  const [boundaryCondition, setBoundaryCondition] = useState('dirichlet');
  const animationRef = useRef(null);
  const canvasRef = useRef(null);

  const numPoints = 500;
  const dt = 0.05;

  // Initial condition functions
  const getInitialCondition = (x) => {
    let value = 0;
    const center = L / 2;
    
    switch (initialCondition) {
      case 'gaussian':
        value = Math.exp(-((x - center) ** 2) / 0.5);
        break;
      case 'step':
        value = x > center - 1 && x < center + 1 ? 1 : 0;
        break;
      case 'step-discontinuous':
        value = x >= center ? 1 : 0;
        break;
      case 'triangle':
        if (x >= center - 1 && x <= center) value = (x - (center - 1));
        else if (x > center && x <= center + 1) value = ((center + 1) - x);
        else value = 0;
        break;
      case 'two-peaks':
        value = Math.exp(-((x - L * 0.3) ** 2) / 0.3) + Math.exp(-((x - L * 0.7) ** 2) / 0.3);
        break;
      case 'sigmoid':
        value = 1 / (1 + Math.exp(-2 * (x - center)));
        break;
      case 'chaotic':
        // Superposition of multiple frequencies with different amplitudes and phases
        value = 0.5 * Math.sin(2 * Math.PI * x / L) +
                0.3 * Math.cos(4 * Math.PI * x / L + 0.5) +
                0.4 * Math.sin(6 * Math.PI * x / L + 1.2) +
                0.25 * Math.cos(8 * Math.PI * x / L - 0.8) +
                0.2 * Math.sin(10 * Math.PI * x / L + 2.1) +
                0.15 * Math.cos(12 * Math.PI * x / L - 1.5) +
                0.1 * Math.sin(16 * Math.PI * x / L + 0.3) +
                0.08 * Math.cos(20 * Math.PI * x / L - 2.0);
        // Normalize to be positive
        value = (value + 1.5) / 2;
        break;
      default:
        value = 0;
    }
    
    // For finite bar with Dirichlet BC, enforce boundary conditions
    if (barType === 'finite' && boundaryCondition === 'dirichlet') {
      value *= Math.sin(Math.PI * x / L);
    }
    
    return value;
  };

  // Heat kernel (Gaussian)
  const heatKernel = (x, t, alpha) => {
    if (t === 0) return x === 0 ? 1 : 0;
    return (1 / Math.sqrt(4 * Math.PI * alpha * t)) * Math.exp(-(x ** 2) / (4 * alpha * t));
  };

  // Convolution for infinite bar
  const solveInfiniteBar = (x, t, alpha) => {
    if (t === 0) return getInitialCondition(x);
    
    let sum = 0;
    const xiMin = -L / 2;
    const xiMax = L * 1.5;
    const numIntegrationPoints = 200;
    const dxi = (xiMax - xiMin) / numIntegrationPoints;
    
    for (let i = 0; i < numIntegrationPoints; i++) {
      const xi = xiMin + i * dxi;
      const fxi = getInitialCondition(xi);
      const kernel = heatKernel(x - xi, t, alpha);
      sum += fxi * kernel * dxi;
    }
    
    return sum;
  };

  // Fourier series for finite bar
  const solveFiniteBar = (x, t, alpha) => {
    if (t === 0) return getInitialCondition(x);
    
    let sum = 0;
    const numTerms = 50;
    
    if (boundaryCondition === 'dirichlet') {
      // Dirichlet: u(0,t) = u(L,t) = 0
      // Eigenfunctions: sin(nπx/L)
      for (let n = 1; n <= numTerms; n++) {
        let Bn = 0;
        const numIntPoints = 100;
        const dx = L / numIntPoints;
        
        for (let i = 0; i < numIntPoints; i++) {
          const xi = i * dx;
          Bn += getInitialCondition(xi) * Math.sin(n * Math.PI * xi / L) * dx;
        }
        Bn *= 2 / L;
        
        const decay = Math.exp(-alpha * ((n * Math.PI / L) ** 2) * t);
        sum += Bn * Math.sin(n * Math.PI * x / L) * decay;
      }
    } else if (boundaryCondition === 'neumann') {
      // Neumann: ∂u/∂x(0,t) = ∂u/∂x(L,t) = 0 (insulated ends)
      // Eigenfunctions: cos(nπx/L), n=0,1,2,...
      
      // n=0 term (constant, represents average temperature)
      let A0 = 0;
      const numIntPoints = 100;
      const dx = L / numIntPoints;
      
      for (let i = 0; i < numIntPoints; i++) {
        const xi = i * dx;
        A0 += getInitialCondition(xi) * dx;
      }
      A0 /= L;
      sum += A0; // This term doesn't decay (conservation of heat)
      
      // n >= 1 terms
      for (let n = 1; n <= numTerms; n++) {
        let An = 0;
        
        for (let i = 0; i < numIntPoints; i++) {
          const xi = i * dx;
          An += getInitialCondition(xi) * Math.cos(n * Math.PI * xi / L) * dx;
        }
        An *= 2 / L;
        
        const decay = Math.exp(-alpha * ((n * Math.PI / L) ** 2) * t);
        sum += An * Math.cos(n * Math.PI * x / L) * decay;
      }
    } else if (boundaryCondition === 'mixed') {
      // Mixed: u(0,t) = 0, ∂u/∂x(L,t) = 0
      // One end fixed at zero, one end insulated
      // Eigenfunctions: sin((n-1/2)πx/L)
      for (let n = 1; n <= numTerms; n++) {
        let Bn = 0;
        const numIntPoints = 100;
        const dx = L / numIntPoints;
        const lambda_n = (n - 0.5) * Math.PI / L;
        
        for (let i = 0; i < numIntPoints; i++) {
          const xi = i * dx;
          Bn += getInitialCondition(xi) * Math.sin(lambda_n * xi) * dx;
        }
        Bn *= 2 / L;
        
        const decay = Math.exp(-alpha * lambda_n * lambda_n * t);
        sum += Bn * Math.sin(lambda_n * x) * decay;
      }
    }
    
    return sum;
  };

  // Animation loop
  useEffect(() => {
    if (isPlaying) {
      animationRef.current = setInterval(() => {
        setTime(t => t + dt);
      }, 50);
    } else {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    }
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [isPlaying]);

  // Drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Setup coordinates
    const padding = 60;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    
    // Draw axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Position (x)', width / 2, height - 20);
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Temperature u(x,t)', 0, 0);
    ctx.restore();
    
    // Time display
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`t = ${time.toFixed(2)}`, width - padding, padding - 10);
    
    // Compute and draw solution
    const xMin = 0;
    const xMax = L;
    const solution = [];
    let maxU = 0;
    
    for (let i = 0; i < numPoints; i++) {
      const x = xMin + (i / (numPoints - 1)) * (xMax - xMin);
      const u = barType === 'infinite' 
        ? solveInfiniteBar(x, time, alpha)
        : solveFiniteBar(x, time, alpha);
      solution.push({ x, u });
      maxU = Math.max(maxU, Math.abs(u));
    }
    
    // Scale
    const yScale = maxU > 0 ? plotHeight * 0.8 / maxU : 1;
    
    // Draw grid
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + i * plotHeight / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    
    // Draw initial condition (faded)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = xMin + (i / (numPoints - 1)) * (xMax - xMin);
      const u0 = getInitialCondition(x);
      const screenX = padding + (x - xMin) / (xMax - xMin) * plotWidth;
      const screenY = height - padding - u0 * yScale;
      if (i === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw Gaussian kernel for infinite bar (if time > 0)
    if (barType === 'infinite' && time > 0) {
      ctx.strokeStyle = '#9d4edd';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      
      const kernelCenter = L / 2; // Center of domain
      for (let i = 0; i < numPoints; i++) {
        const x = xMin + (i / (numPoints - 1)) * (xMax - xMin);
        const kernelValue = heatKernel(x - kernelCenter, time, alpha);
        const screenX = padding + (x - xMin) / (xMax - xMin) * plotWidth;
        const screenY = height - padding - kernelValue * yScale;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Label for Gaussian
      ctx.fillStyle = '#9d4edd';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Gaussian kernel G(x-ξ,t)', padding + 10, padding + 20);
    }
    
    // Draw current solution with gradient
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, '#ff6b6b');
    gradient.addColorStop(0.5, '#ffd93d');
    gradient.addColorStop(1, '#6bcf7f');
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < solution.length; i++) {
      const screenX = padding + (solution[i].x - xMin) / (xMax - xMin) * plotWidth;
      const screenY = height - padding - solution[i].u * yScale;
      if (i === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();
    
    // Fill area under curve
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    for (let i = 0; i < solution.length; i++) {
      const screenX = padding + (solution[i].x - xMin) / (xMax - xMin) * plotWidth;
      const screenY = height - padding - solution[i].u * yScale;
      ctx.lineTo(screenX, screenY);
    }
    ctx.lineTo(width - padding, height - padding);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    
  }, [time, alpha, L, barType, initialCondition, boundaryCondition]);

  const handleReset = () => {
    setTime(0);
    setIsPlaying(false);
  };

  return (
    <div className="w-full h-screen bg-gray-900 p-6 flex flex-col">
      <div className="text-white mb-4">
        <h1 className="text-3xl font-bold mb-2">Heat Diffusion Visualization</h1>
      </div>
      
      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={500}
        className="bg-gray-800 rounded-lg shadow-lg mb-4"
      />
      
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        <div className="flex gap-4 items-center">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <button
            onClick={handleReset}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition"
          >
            <RotateCcw size={20} />
            Reset
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-white block mb-2">Bar Type:</label>
            <select
              value={barType}
              onChange={(e) => {
                setBarType(e.target.value);
                setTime(0);
              }}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              <option value="infinite">Infinite Bar (Convolution)</option>
              <option value="finite">Finite Bar (Fourier Series)</option>
            </select>
          </div>
          
          {barType === 'finite' && (
            <div>
              <label className="text-white block mb-2">Boundary Conditions:</label>
              <select
                value={boundaryCondition}
                onChange={(e) => {
                  setBoundaryCondition(e.target.value);
                  setTime(0);
                }}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                <option value="dirichlet">Dirichlet: u(0)=u(L)=0</option>
                <option value="neumann">Neumann: ∂u/∂x(0)=∂u/∂x(L)=0</option>
                <option value="mixed">Mixed: u(0)=0, ∂u/∂x(L)=0</option>
              </select>
            </div>
          )}
          
          <div>
            <label className="text-white block mb-2">Initial Condition:</label>
            <select
              value={initialCondition}
              onChange={(e) => {
                setInitialCondition(e.target.value);
                setTime(0);
              }}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              <option value="gaussian">Gaussian Peak</option>
              <option value="step">Step Function (pulse)</option>
              <option value="step-discontinuous">Step 0→1 (discontinuous)</option>
              <option value="triangle">Triangle</option>
              <option value="two-peaks">Two Peaks</option>
              <option value="sigmoid">Sigmoid</option>
              <option value="chaotic">Chaotic (Multi-frequency)</option>
            </select>
          </div>

          <div>
            <label className="text-white block mb-2">
              Diffusivity (α): {alpha.toFixed(2)}
            </label>
            <input
              type="range"
              min="0.01"
              max="0.5"
              step="0.01"
              value={alpha}
              onChange={(e) => {
                setAlpha(parseFloat(e.target.value));
                setTime(0);
              }}
              className="w-full"
            />
          </div>

          <div>
            <label className="text-white block mb-2">
              Bar Length (L): {L.toFixed(1)}
            </label>
            <input
              type="number"
              min="1"
              max="50"
              step="0.5"
              value={L}
              onChange={(e) => {
                const newL = parseFloat(e.target.value);
                if (!isNaN(newL) && newL > 0) {
                  setL(newL);
                  setTime(0);
                }
              }}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
            />
          </div>
        </div>
        
        <div className="text-gray-400 text-sm border-t border-gray-700 pt-4">
          <p><span className="text-gray-300">Dashed gray line:</span> Initial condition f(x)</p>
          {barType === 'infinite' && time > 0 && (
            <p><span className="text-purple-400">Dashed purple line:</span> Gaussian kernel G(x-ξ,t) centered at x=5</p>
          )}
          <p><span className="text-gray-300">Solid colored line:</span> Current temperature distribution u(x,t)</p>
          <p className="mt-2">
            {barType === 'infinite' 
              ? 'Infinite bar: Solution = f(x) ⊗ G(x,t) (convolution with Gaussian kernel). The purple curve shows the spreading Gaussian.'
              : boundaryCondition === 'dirichlet'
                ? 'Dirichlet BC: Both ends fixed at zero temperature (heat sinks). Heat escapes at boundaries.'
                : boundaryCondition === 'neumann'
                  ? 'Neumann BC: Both ends insulated (no heat flow through boundaries). Total heat is conserved!'
                  : 'Mixed BC: Left end at zero, right end insulated. Asymmetric behavior.'
            }
          </p>
        </div>
      </div>
    </div>
  );
};

export default HeatDiffusionVisualization;
