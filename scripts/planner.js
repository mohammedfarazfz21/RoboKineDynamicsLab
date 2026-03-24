/* ===================================================================
   RoboKineDynamics Lab — Trajectory Planner (planner.js)
   Interpolation logic for Joint Level Analysis (JLA).
   =================================================================== */

(function () {
  'use strict';

  class TrajectoryPlanner {
    constructor(kinematics, uiUpdateCallback) {
      this.kinematics = kinematics;
      this.uiUpdateCallback = uiUpdateCallback;
      
      this.startPose = null;
      this.endPose = null;
      this.isPlaying = false;
      this.duration = 2.0; // seconds
    }

    setStart() {
      this.startPose = [...this.kinematics.angles];
      console.log('Start pose set:', this.startPose);
    }

    setEnd() {
      this.endPose = [...this.kinematics.angles];
      console.log('End pose set:', this.endPose);
    }

    /**
     * Play the interpolation from start to end.
     * @param {string} method 'linear' or 'cubic'
     */
    async play(method = 'linear') {
      if (!this.startPose || !this.endPose) {
        alert('Please set both Start and End poses first.');
        return;
      }
      if (this.isPlaying) return;

      this.isPlaying = true;
      const startTime = performance.now();
      const durationMs = this.duration * 1000;

      const animate = (time) => {
        if (!this.isPlaying) return;

        const elapsed = time - startTime;
        let t = Math.min(1.0, elapsed / durationMs);

        // Apply scaling for cubic (smooth start/stop)
        const alpha = method === 'cubic' ? t * t * (3 - 2 * t) : t;

        // Interpolate
        const currentAngles = this.startPose.map((start, i) => {
          return start + (this.endPose[i] - start) * alpha;
        });

        // Update kinematics
        this.kinematics.angles = currentAngles;
        this.kinematics.update();
        
        // Callback to UI to update sliders and 3D
        if (this.uiUpdateCallback) this.uiUpdateCallback();

        if (t < 1.0) {
          requestAnimationFrame(animate);
        } else {
          this.isPlaying = false;
        }
      };

      requestAnimationFrame(animate);
    }

    stop() {
      this.isPlaying = false;
    }
  }

  // Export
  window.TrajectoryPlanner = TrajectoryPlanner;

})();
