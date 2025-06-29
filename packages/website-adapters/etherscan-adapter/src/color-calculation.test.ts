/**
 * @jest-environment jsdom
 */

describe('Trust Score Color Calculation', () => {
  // Test the color calculation logic directly
  function calculateTrustColor(roi: number, volume: number): string {
    // Calculate x = 255 / (1 + 0.001 * volume)
    const x = Math.round(255 / (1 + 0.001 * volume));
    
    // Clamp ROI to 0-2 range for interpolation
    const clampedROI = Math.max(0, Math.min(2, roi));
    
    // Normalize ROI to 0-1 range for interpolation
    const t = clampedROI / 2;
    
    // Linear interpolation from RGB(255, x, 255) to RGB(x, 255, 255)
    const red = Math.round(255 * (1 - t) + x * t);
    const green = Math.round(x * (1 - t) + 255 * t);
    const blue = 255; // Always 255
    
    // Convert to hex
    const redHex = red.toString(16).padStart(2, '0');
    const greenHex = green.toString(16).padStart(2, '0');
    const blueHex = blue.toString(16).padStart(2, '0');
    
    return `#${redHex}${greenHex}${blueHex}`;
  }

  describe('Color formula implementation', () => {
    it('should calculate correct colors for ROI = 0 (magenta)', () => {
      // ROI = 0, Volume = 1000
      // x = 255 / (1 + 1) = 127.5 ≈ 128
      // RGB(255, 128, 255) = #ff80ff
      expect(calculateTrustColor(0, 1000)).toBe('#ff80ff');
      
      // ROI = 0, Volume = 0
      // x = 255 / (1 + 0) = 255
      // RGB(255, 255, 255) = #ffffff
      expect(calculateTrustColor(0, 0)).toBe('#ffffff');
      
      // ROI = 0, Volume = 100000
      // x = 255 / (1 + 100) = 2.52 ≈ 3
      // RGB(255, 3, 255) = #ff03ff
      expect(calculateTrustColor(0, 100000)).toBe('#ff03ff');
    });

    it('should calculate correct colors for ROI = 2 (cyan)', () => {
      // ROI = 2, Volume = 1000
      // x = 128, t = 1
      // RGB(128, 255, 255) = #80ffff
      expect(calculateTrustColor(2, 1000)).toBe('#80ffff');
      
      // ROI = 2, Volume = 0
      // x = 255, t = 1
      // RGB(255, 255, 255) = #ffffff
      expect(calculateTrustColor(2, 0)).toBe('#ffffff');
      
      // ROI = 2, Volume = 100000
      // x = 3, t = 1
      // RGB(3, 255, 255) = #03ffff
      expect(calculateTrustColor(2, 100000)).toBe('#03ffff');
    });

    it('should calculate correct colors for ROI = 1 (middle)', () => {
      // ROI = 1, Volume = 1000
      // x = 128, t = 0.5
      // Red: 255 * 0.5 + 128 * 0.5 = 127.5 + 64 = 191.5 ≈ 192
      // Green: 128 * 0.5 + 255 * 0.5 = 64 + 127.5 = 191.5 ≈ 192
      // RGB(192, 192, 255) = #c0c0ff
      expect(calculateTrustColor(1, 1000)).toBe('#c0c0ff');
      
      // ROI = 1, Volume = 5000
      // x = 255 / (1 + 5) = 42.5 ≈ 43, t = 0.5
      // Red: 255 * 0.5 + 43 * 0.5 = 127.5 + 21.5 = 149
      // Green: 43 * 0.5 + 255 * 0.5 = 21.5 + 127.5 = 149
      // RGB(149, 149, 255) = #9595ff
      expect(calculateTrustColor(1, 5000)).toBe('#9595ff');
    });

    it('should handle edge cases', () => {
      // Test negative ROI (should clamp to 0)
      expect(calculateTrustColor(-1, 1000)).toBe('#ff80ff'); // Same as ROI = 0
      
      // Test ROI > 2 (should clamp to 2)
      expect(calculateTrustColor(5, 1000)).toBe('#80ffff'); // Same as ROI = 2
      
      // Test very high volume
      // ROI = 1, Volume = 1000000
      // x = 255 / (1 + 1000) = 255 / 1001 ≈ 0.25 ≈ 0, t = 0.5
      // Red: 255 * 0.5 + 0 * 0.5 = 127.5 ≈ 128
      // Green: 0 * 0.5 + 255 * 0.5 = 127.5 ≈ 128  
      // Blue: 255
      expect(calculateTrustColor(1, 1000000)).toBe('#8080ff');
    });

    it('should match the specified formula examples', () => {
      // The README specifies the formula but doesn't give specific examples
      // Let's verify the formula works as intended
      
      // Low volume, high ROI should be close to cyan with high red/green values
      const lowVolumeHighROI = calculateTrustColor(2, 100);
      expect(lowVolumeHighROI).toMatch(/^#[a-f0-9]{6}$/); // Valid hex
      
      // High volume, low ROI should be close to magenta with low red/green values  
      const highVolumeLowROI = calculateTrustColor(0, 10000);
      expect(highVolumeLowROI).toMatch(/^#[a-f0-9]{6}$/); // Valid hex
      
      // Verify that higher volume makes red/green components smaller
      const color1 = calculateTrustColor(0, 1000);   // x = 128
      const color2 = calculateTrustColor(0, 10000);  // x = ~25
      
      // Extract green component (middle two hex digits)
      const green1 = parseInt(color1.slice(3, 5), 16);
      const green2 = parseInt(color2.slice(3, 5), 16);
      
      expect(green2).toBeLessThan(green1); // Higher volume should have lower green
    });
  });

  describe('Volume calculation edge cases', () => {
    it('should handle zero volume correctly', () => {
      // x = 255 / (1 + 0) = 255
      const color = calculateTrustColor(0, 0);
      expect(color).toBe('#ffffff'); // White for zero volume
    });

    it('should handle very large volumes', () => {
      // x = 255 / (1 + 1000000) ≈ 0.0002 ≈ 0
      const color = calculateTrustColor(1, 1000000);
      // Should be very close to RGB(128, 128, 255) since x ≈ 0
      expect(color).toBe('#8080ff');
    });

    it('should produce smooth gradients', () => {
      // Test that colors change smoothly with volume
      const volumes = [100, 1000, 10000, 100000];
      const colors = volumes.map(vol => calculateTrustColor(1, vol));
      
      // All should be valid hex colors
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      });
      
      // Green component should decrease as volume increases
      const greenComponents = colors.map(color => parseInt(color.slice(3, 5), 16));
      for (let i = 1; i < greenComponents.length; i++) {
        expect(greenComponents[i]).toBeLessThanOrEqual(greenComponents[i-1]);
      }
    });
  });
});