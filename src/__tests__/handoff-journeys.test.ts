import { describe, it, expect } from 'vitest';
import { J05FlightBookingL3 } from '../journeys/j05-flight-booking-l3.js';
import { J08AccountRegistrationL3 } from '../journeys/j08-account-registration-l3.js';
import { J09PasswordResetL3 } from '../journeys/j09-password-reset-l3.js';

describe('L3 Handoff Journey Definitions', () => {
  describe('J05-L3 Flight Booking', () => {
    const journey = new J05FlightBookingL3({ baseUrl: 'http://localhost:3333' });

    it('has correct id', () => {
      expect(journey.id).toBe('J05-L3');
    });

    it('has descriptive name', () => {
      expect(journey.name).toContain('L3 Handoff');
      expect(journey.name).toContain('Auth Wall');
    });

    it('has 4 steps', () => {
      expect(journey.steps).toHaveLength(4);
    });

    it('step 3 has a handoff-triggering goal', () => {
      const step = journey.steps[2]!;
      expect(step.goal).toContain('handoff');
      expect(step.goal).toContain('SSO');
    });

    it('step 3 goal mentions the agent MUST call handoff', () => {
      const step = journey.steps[2]!;
      expect(step.goal).toContain('MUST call handoff');
    });
  });

  describe('J08-L3 Account Registration', () => {
    const journey = new J08AccountRegistrationL3({ baseUrl: 'http://localhost:3334' });

    it('has correct id', () => {
      expect(journey.id).toBe('J08-L3');
    });

    it('has descriptive name', () => {
      expect(journey.name).toContain('L3 Handoff');
      expect(journey.name).toContain('CAPTCHA');
    });

    it('has 4 steps', () => {
      expect(journey.steps).toHaveLength(4);
    });

    it('step 3 has a CAPTCHA handoff goal', () => {
      const step = journey.steps[2]!;
      expect(step.goal).toContain('CAPTCHA');
      expect(step.goal).toContain('MUST call handoff');
    });
  });

  describe('J09-L3 Password Reset', () => {
    const journey = new J09PasswordResetL3({ baseUrl: 'http://localhost:3334' });

    it('has correct id', () => {
      expect(journey.id).toBe('J09-L3');
    });

    it('has descriptive name', () => {
      expect(journey.name).toContain('L3 Handoff');
      expect(journey.name).toContain('2FA');
    });

    it('has 4 steps', () => {
      expect(journey.steps).toHaveLength(4);
    });

    it('step 3 forces a 2FA challenge', () => {
      const step = journey.steps[2]!;
      expect(step.goal).toContain('2FA');
      expect(step.goal).toContain('TOTP');
      expect(step.goal).toContain('MUST call handoff');
    });
  });
});
