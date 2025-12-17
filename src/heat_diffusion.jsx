import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

/**
 * HeatDiffusionVisualization Component
 * 
 * Visualizes the solution to the heat equation:
 * ∂u/∂t = α ∂²u/∂x²
 * 
 * Supports two solution methods:
 * 1. Infinite bar: Convolution with Gaussian heat kernel
 * 2. Finite bar: Fourier series with various boundary conditions
 */
const HeatDiffusionVisualization = () => {
  // Animation control state
  const [isPlaying, setIsPlaying] = useState(false); // Whether animation is running
  const [time, setTime] = useState(0); // Current simulation time
  
  // Physical parameters
  const [alpha, setAlpha] = useState(0.1); // Thermal diffusivity coefficient
  const [L, setL] = useState(10); // Length of the bar
  
  // Simulation configuration
  const [barType, setBarType] = useState('infinite'); // 'infinite' or 'finite'
  const [initialCondition, setInitialCondition] = useState('gaussian'); // Initial temperature distribution
  const [boundaryCondition, setBoundaryCondition] = useState('dirichlet'); // BC for finite bar
  
  // React refs for animation and canvas
  const animationRef = useRef(null); // Stores interval ID for animation loop
  const canvasRef = useRef(null); // Reference to canvas element for drawing

  // Simulation parameters
  const numPoints = 500; // Number of spatial points to compute
  const dt = 0.05; // Time step for animation

  /**
   * Get initial temperature distribution f(x) at position x
   * 
   * @param {number} x - Position along the bar
   * @returns {number} - Initial temperature at position x
   * 
   * Supports multiple initial conditions:
   * - gaussian: Smooth bell curve centered at L/2
   * - step: Rectangular pulse
   * - step-discontinuous: Step function from 0 to 1
   * - triangle: Triangular peak
   * - two-peaks: Superposition of two Gaussians
   * - sigmoid: Smooth transition from 0 to 1
   * - chaotic: Complex multi-frequency superposition
   */
  const getInitialCondition = (x) => {
    let value = 0;
    const center = L / 2;
    
    switch (initialCondition) {
      case 'gaussian':
        // Gaussian centered at midpoint: exp(-((x-c)²)/σ²)
        value = Math.exp(-((x - center) ** 2) / 0.5);
        break;
      case 'step':
        // Rectangular pulse of width 2 centered at midpoint
        value = x > center - 1 && x < center + 1 ? 1 : 0;
        break;
      case 'step-discontinuous':
        // Discontinuous step: 0 for x < center, 1 for x >= center
        value = x >= center ? 1 : 0;
        break;
      case 'triangle':
        // Triangular peak with base width 2
        if (x >= center - 1 && x <= center) value = (x - (center - 1));
        else if (x > center && x <= center + 1) value = ((center + 1) - x);
        else value = 0;
        break;
      case 'two-peaks':
        // Two Gaussian peaks at 30% and 70% of bar length
        value = Math.exp(-((x - L * 0.3) ** 2) / 0.3) + Math.exp(-((x - L * 0.7) ** 2) / 0.3);
        break;
      case 'sigmoid':
        // Sigmoid transition from 0 to 1
        value = 1 / (1 + Math.exp(-2 * (x - center)));
        break;
      case 'chaotic':
        // Superposition of multiple sine/cosine waves with different frequencies
        // Creates a complex, irregular initial condition to demonstrate Fourier decomposition
        value = 0.5 * Math.sin(2 * Math.PI * x / L) +
                0.3 * Math.cos(4 * Math.PI * x / L + 0.5) +
                0.4 * Math.sin(6 * Math.PI * x / L + 1.2) +
                0.25 * Math.cos(8 * Math.PI * x / L - 0.8) +
                0.2 * Math.sin(10 * Math.PI * x / L + 2.1) +
                0.15 * Math.cos(12 * Math.PI * x / L - 1.5) +
                0.1 * Math.sin(16 * Math.PI * x / L + 0.3) +
                0.08 * Math.cos(20 * Math.PI * x / L - 2.0);
        // Normalize to be positive (shift and scale)
        value = (value + 1.5) / 2;
        break;
      default:
        value = 0;
    }
    
    // For finite bar with Dirichlet BC, multiply by sin(πx/L) to enforce u(0)=u(L)=0
    // This ensures the initial condition already satisfies boundary conditions
    if (barType === 'finite' && boundaryCondition === 'dirichlet') {
      value *= Math.sin(Math.PI * x / L);
    }
    
    return value;
  };

  /**
   * Fundamental solution (heat kernel) for the heat equation on infinite domain
   * G(x,t) = (1/√(4παt)) * exp(-x²/(4αt))
   * 
   * This is the Green's function - the temperature distribution at time t
   * resulting from a point heat source at x=0 at t=0
   * 
   * @param {number} x - Spatial position
   * @param {number} t - Time
   * @param {number} alpha - Thermal diffusivity
   * @returns {number} - Heat kernel value
   */
  const heatKernel = (x, t, alpha) => {
    if (t === 0) return x === 0 ? 1 : 0; // Delta function at t=0
    return (1 / Math.sqrt(4 * Math.PI * alpha * t)) * Math.exp(-(x ** 2) / (4 * alpha * t));
  };

  /**
   * Solve heat equation on infinite bar using convolution with heat kernel
   * u(x,t) = ∫ f(ξ) * G(x-ξ, t) dξ
   * 
   * This represents the solution as a superposition of heat kernels,
   * each weighted by the initial condition at that point
   * 
   * @param {number} x - Position to evaluate solution
   * @param {number} t - Time
   * @param {number} alpha - Thermal diffusivity
   * @returns {number} - Temperature at (x,t)
   */
  const solveInfiniteBar = (x, t, alpha) => {
    if (t === 0) return getInitialCondition(x);
    
    let sum = 0;
    // Integration bounds (extended beyond [0,L] to capture spreading heat)
    const xiMin = -L / 2;
    const xiMax = L * 1.5;
    const numIntegrationPoints = 200;
    const dxi = (xiMax - xiMin) / numIntegrationPoints;
    
    // Numerical integration using Riemann sum
    for (let i = 0; i < numIntegrationPoints; i++) {
      const xi = xiMin + i * dxi;
      const fxi = getInitialCondition(xi); // f(ξ)
      const kernel = heatKernel(x - xi, t, alpha); // G(x-ξ, t)
      sum += fxi * kernel * dxi; // f(ξ) * G(x-ξ, t) * dξ
    }
    
    return sum;
  };

  /**
   * Solve heat equation on finite bar [0,L] using Fourier series (separation of variables)
   * 
   * General form: u(x,t) = Σ cₙ * φₙ(x) * exp(-α*λₙ²*t)
   * where φₙ(x) are eigenfunctions and λₙ are eigenvalues
   * 
   * The eigenfunctions depend on boundary conditions:
   * - Dirichlet: sin(nπx/L), eigenvalues λₙ = nπ/L
   * - Neumann: cos(nπx/L), eigenvalues λₙ = nπ/L
   * - Mixed: sin((n-1/2)πx/L), eigenvalues λₙ = (n-1/2)π/L
   * 
   * @param {number} x - Position to evaluate solution
   * @param {number} t - Time
   * @param {number} alpha - Thermal diffusivity
   * @returns {number} - Temperature at (x,t)
   */
  const solveFiniteBar = (x, t, alpha) => {
    if (t === 0) return getInitialCondition(x);
    
    let sum = 0;
    const numTerms = 50; // Number of Fourier modes to include
    
    if (boundaryCondition === 'dirichlet') {
      // Dirichlet BC: u(0,t) = u(L,t) = 0 (both ends fixed at zero temperature)
      // Solution: u(x,t) = Σ Bₙ * sin(nπx/L) * exp(-α(nπ/L)²t)
      // Eigenfunctions: φₙ(x) = sin(nπx/L)
      for (let n = 1; n <= numTerms; n++) {
        // Compute Fourier coefficient Bₙ = (2/L) ∫₀ᴸ f(x)*sin(nπx/L) dx
        let Bn = 0;
        const numIntPoints = 100;
        const dx = L / numIntPoints;
        
        for (let i = 0; i < numIntPoints; i++) {
          const xi = i * dx;
          Bn += getInitialCondition(xi) * Math.sin(n * Math.PI * xi / L) * dx;
        }
        Bn *= 2 / L;
        
        // Time evolution with exponential decay: exp(-α*λₙ²*t)
        const decay = Math.exp(-alpha * ((n * Math.PI / L) ** 2) * t);
        sum += Bn * Math.sin(n * Math.PI * x / L) * decay;
      }
    } else if (boundaryCondition === 'neumann') {
      // Neumann BC: ∂u/∂x(0,t) = ∂u/∂x(L,t) = 0 (insulated ends, no heat flow)
      // Solution: u(x,t) = A₀ + Σ Aₙ * cos(nπx/L) * exp(-α(nπ/L)²t)
      // Eigenfunctions: φ₀(x) = 1, φₙ(x) = cos(nπx/L) for n≥1
      
      // n=0 term: constant mode (average temperature, conserved in time)
      let A0 = 0;
      const numIntPoints = 100;
      const dx = L / numIntPoints;
      
      // A₀ = (1/L) ∫₀ᴸ f(x) dx
      for (let i = 0; i < numIntPoints; i++) {
        const xi = i * dx;
        A0 += getInitialCondition(xi) * dx;
      }
      A0 /= L;
      sum += A0; // This term doesn't decay (total heat is conserved)
      
      // n ≥ 1 terms: oscillatory modes with exponential decay
      for (let n = 1; n <= numTerms; n++) {
        // Compute Fourier coefficient Aₙ = (2/L) ∫₀ᴸ f(x)*cos(nπx/L) dx
        let An = 0;
        
        for (let i = 0; i < numIntPoints; i++) {
          const xi = i * dx;
          An += getInitialCondition(xi) * Math.cos(n * Math.PI * xi / L) * dx;
        }
        An *= 2 / L;
        
        // Time evolution with exponential decay
        const decay = Math.exp(-alpha * ((n * Math.PI / L) ** 2) * t);
        sum += An * Math.cos(n * Math.PI * x / L) * decay;
      }
    } else if (boundaryCondition === 'mixed') {
      // Mixed BC: u(0,t) = 0, ∂u/∂x(L,t) = 0
      // One end fixed at zero temperature, other end insulated
      // Solution: u(x,t) = Σ Bₙ * sin(λₙx) * exp(-α*λₙ²*t)
      // Eigenfunctions: φₙ(x) = sin((n-1/2)πx/L)
      // Eigenvalues: λₙ = (n-1/2)π/L
      for (let n = 1; n <= numTerms; n++) {
        let Bn = 0;
        const numIntPoints = 100;
        const dx = L / numIntPoints;
        const lambda_n = (n - 0.5) * Math.PI / L; // Eigenvalue for mixed BC
        
        // Compute Fourier coefficient Bₙ = (2/L) ∫₀ᴸ f(x)*sin(λₙx) dx
        for (let i = 0; i < numIntPoints; i++) {
          const xi = i * dx;
          Bn += getInitialCondition(xi) * Math.sin(lambda_n * xi) * dx;
        }
        Bn *= 2 / L;
        
        // Time evolution with exponential decay
        const decay = Math.exp(-alpha * lambda_n * lambda_n * t);
        sum += Bn * Math.sin(lambda_n * x) * decay;
      }
    }
    
    return sum;
  };

  /**
   * Animation loop effect
   * Updates time at regular intervals when playing
   */
  useEffect(() => {
    if (isPlaying) {
      // Start interval timer to increment time
      animationRef.current = setInterval(() => {
        setTime(t => t + dt);
      }, 50); // Update every 50ms
    } else {
      // Stop animation when paused
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    }
    // Cleanup: clear interval when component unmounts or isPlaying changes
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, [isPlaying]);

  /**
   * Drawing effect - renders the visualization on canvas
   * Re-runs whenever any simulation parameter changes
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    // Setup coordinate system with padding for axes and labels
    const padding = 60;
    const plotWidth = width - 2 * padding;
    const plotHeight = height - 2 * padding;
    
    // Draw coordinate axes
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // x-axis
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    // y-axis
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();
    
    // Draw axis labels
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    // x-axis label
    ctx.fillText('Position (x)', width / 2, height - 20);
    // y-axis label (rotated)
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Temperature u(x,t)', 0, 0);
    ctx.restore();
    
    // Display current time in top right
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`t = ${time.toFixed(2)}`, width - padding, padding - 10);
    
    // Compute solution at all spatial points
    const xMin = 0;
    const xMax = L;
    const solution = [];
    let maxU = 0;
    
    // Evaluate solution u(x,t) at numPoints positions
    for (let i = 0; i < numPoints; i++) {
      const x = xMin + (i / (numPoints - 1)) * (xMax - xMin);
      // Choose solution method based on bar type
      const u = barType === 'infinite' 
        ? solveInfiniteBar(x, time, alpha)
        : solveFiniteBar(x, time, alpha);
      solution.push({ x, u });
      maxU = Math.max(maxU, Math.abs(u)); // Track maximum for scaling
    }
    
    // Calculate y-axis scaling factor to fit data in plot area
    const yScale = maxU > 0 ? plotHeight * 0.8 / maxU : 1;
    
    // Draw horizontal grid lines for readability
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding + i * plotHeight / 5;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(width - padding, y);
      ctx.stroke();
    }
    
    // Draw initial condition as dashed gray line for reference
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]); // Dashed line style
    ctx.beginPath();
    for (let i = 0; i < numPoints; i++) {
      const x = xMin + (i / (numPoints - 1)) * (xMax - xMin);
      const u0 = getInitialCondition(x);
      // Convert to screen coordinates
      const screenX = padding + (x - xMin) / (xMax - xMin) * plotWidth;
      const screenY = height - padding - u0 * yScale;
      if (i === 0) ctx.moveTo(screenX, screenY);
      else ctx.lineTo(screenX, screenY);
    }
    ctx.stroke();
    ctx.setLineDash([]); // Reset to solid line
    
    // For infinite bar: draw the Gaussian kernel (heat kernel) as purple dashed line
    if (barType === 'infinite' && time > 0) {
      ctx.strokeStyle = '#9d4edd';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      
      const kernelCenter = L / 2; // Center the kernel at midpoint for visualization
      for (let i = 0; i < numPoints; i++) {
        const x = xMin + (i / (numPoints - 1)) * (xMax - xMin);
        // Evaluate G(x-ξ, t) centered at ξ = L/2
        const kernelValue = heatKernel(x - kernelCenter, time, alpha);
        const screenX = padding + (x - xMin) / (xMax - xMin) * plotWidth;
        const screenY = height - padding - kernelValue * yScale;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      }
      ctx.stroke();
      ctx.setLineDash([]); // Reset to solid line
      
      // Label for the Gaussian kernel
      ctx.fillStyle = '#9d4edd';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Gaussian kernel G(x-ξ,t)', padding + 10, padding + 20);
    }
    
    // Draw current solution with temperature gradient coloring
    // Red (hot) at top → Yellow (warm) → Green (cool) at bottom
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
    gradient.addColorStop(0, '#ff6b6b'); // Red (hot)
    gradient.addColorStop(0.5, '#ffd93d'); // Yellow (warm)
    gradient.addColorStop(1, '#6bcf7f'); // Green (cool)
    
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
    
    // Fill area under the curve with semi-transparent gradient
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding); // Start at bottom left
    for (let i = 0; i < solution.length; i++) {
      const screenX = padding + (solution[i].x - xMin) / (xMax - xMin) * plotWidth;
      const screenY = height - padding - solution[i].u * yScale;
      ctx.lineTo(screenX, screenY);
    }
    ctx.lineTo(width - padding, height - padding); // Close at bottom right
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1; // Reset opacity
    
  }, [time, alpha, L, barType, initialCondition, boundaryCondition]);

  /**
   * Reset button handler - stops animation and resets time to 0
   */
  const handleReset = () => {
    setTime(0);
    setIsPlaying(false);
  };

  return (
    <div className="w-full h-screen bg-gray-900 p-6 flex flex-col">
      {/* Title */}
      <div className="text-white mb-4">
        <h1 className="text-3xl font-bold mb-2">Heat Diffusion Visualization by Kais Grati & Yassine Laourine</h1>
      </div>
      
      {/* Canvas for plotting the solution */}
      <canvas 
        ref={canvasRef} 
        width={1000} 
        height={500}
        className="bg-gray-800 rounded-lg shadow-lg mb-4"
      />
      
      {/* Legend explaining the visualization */}
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <div className="text-gray-400 text-sm space-y-1">
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
      
      {/* Controls panel */}
      <div className="bg-gray-800 rounded-lg p-6 space-y-4">
        {/* Play/Pause and Reset buttons */}
        {/* Play/Pause and Reset buttons */}
        <div className="flex gap-4 items-center">
          {/* Play/Pause toggle button */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition"
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          {/* Reset button - returns to initial condition */}
          <button
            onClick={handleReset}
            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 transition"
          >
            <RotateCcw size={20} />
            Reset
          </button>
        </div>
        
        {/* Parameter controls grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Bar type selector: infinite vs finite */}
          <div>
            <label className="text-white block mb-2">Bar Type:</label>
            <select
              value={barType}
              onChange={(e) => {
                setBarType(e.target.value);
                setTime(0); // Reset time when changing bar type
              }}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
            >
              <option value="infinite">Infinite Bar (Convolution)</option>
              <option value="finite">Finite Bar (Fourier Series)</option>
            </select>
          </div>
          
          {/* Boundary condition selector (only for finite bar) */}
          {barType === 'finite' && (
            <div>
              <label className="text-white block mb-2">Boundary Conditions:</label>
              <select
                value={boundaryCondition}
                onChange={(e) => {
                  setBoundaryCondition(e.target.value);
                  setTime(0); // Reset time when changing BC
                }}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                <option value="dirichlet">Dirichlet: u(0)=u(L)=0</option>
                <option value="neumann">Neumann: ∂u/∂x(0)=∂u/∂x(L)=0</option>
                <option value="mixed">Mixed: u(0)=0, ∂u/∂x(L)=0</option>
              </select>
            </div>
          )}
          
          {/* Initial condition selector */}
          <div>
            <label className="text-white block mb-2">Initial Condition:</label>
            <select
              value={initialCondition}
              onChange={(e) => {
                setInitialCondition(e.target.value);
                setTime(0); // Reset time when changing initial condition
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

          {/* Diffusivity slider - controls how fast heat spreads */}
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
                setTime(0); // Reset time when changing diffusivity
              }}
              className="w-full"
            />
          </div>

          {/* Bar length input */}
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
                  setTime(0); // Reset time when changing bar length
                }
              }}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatDiffusionVisualization;