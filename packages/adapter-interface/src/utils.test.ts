import { calculateTrustColor, darkenColor, formatVolume } from './index';

describe('Adapter Utility Functions', () => {
  describe('calculateTrustColor', () => {
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

    it('should handle edge cases', () => {
      // Test negative ROI (should clamp to 0)
      expect(calculateTrustColor(-1, 1000)).toBe('#ff80ff'); // Same as ROI = 0
      
      // Test ROI > 2 (should clamp to 2)
      expect(calculateTrustColor(5, 1000)).toBe('#80ffff'); // Same as ROI = 2
    });
  });

  describe('darkenColor', () => {
    it('should darken colors correctly', () => {
      // Test darkening white
      const darkenedWhite = darkenColor('#ffffff', 20);
      expect(darkenedWhite).toBe('#cccccc'); // Should be darker
      
      // Test darkening with specific color
      const darkenedColor = darkenColor('#ff80ff', 10);
      expect(darkenedColor.length).toBe(7); // Should be valid hex color
      expect(darkenedColor.startsWith('#')).toBe(true);
    });
  });

  describe('formatVolume', () => {
    it('should format volume correctly', () => {
      expect(formatVolume(500)).toBe('500');
      expect(formatVolume(1500)).toBe('1.5K');
      expect(formatVolume(1500000)).toBe('1.5M');
      expect(formatVolume(2300000)).toBe('2.3M');
    });
  });
});