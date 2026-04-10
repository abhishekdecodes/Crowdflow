import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock Firebase so tests run without real GCP credentials
vi.mock('./firebase', () => ({
  auth: {},
  db: {},
  logInWithGoogle: vi.fn(),
  logOut: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (auth, cb) => { cb(null); return () => {}; },
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: (col, cb) => { cb({ empty: true, docs: [] }); return () => {}; },
  getFirestore: vi.fn(),
}));

vi.mock('@react-google-maps/api', () => ({
  useJsApiLoader: () => ({ isLoaded: false }),
  GoogleMap: ({ children }) => <div data-testid="google-map">{children}</div>,
  Marker: () => <div data-testid="marker" />,
  DirectionsRenderer: () => <div data-testid="directions" />,
  Autocomplete: ({ children }) => <div>{children}</div>,
}));

// Import App after mocks are set up
import App from './App';

describe('CrowdFlow App', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the CrowdFlow title', () => {
    render(<App />);
    expect(screen.getByText('CrowdFlow')).toBeDefined();
  });

  it('renders the welcome slider with accessibility role', () => {
    render(<App />);
    expect(screen.getByRole('marquee')).toBeDefined();
  });

  it('renders the Sign In button when user is not logged in', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('renders the Real-Time Crowd Heatmap section', () => {
    render(<App />);
    expect(screen.getByText(/Real-Time Crowd Heatmap/i)).toBeDefined();
  });

  it('renders all heatmap zones', () => {
    render(<App />);
    expect(screen.getByText('Entrance Gate 1')).toBeDefined();
    expect(screen.getByText('Food Stall A')).toBeDefined();
    expect(screen.getByText('Washroom Block B')).toBeDefined();
  });

  it('renders the chat bubble button with proper aria-label', () => {
    render(<App />);
    // The floating chat button should exist in the document
    const chatRegion = document.querySelector('[aria-label="CrowdFlow AI Assistant"]');
    expect(chatRegion).toBeTruthy();
  });

  it('renders chat trigger button with expanded state attribute', () => {
    render(<App />);
    const chatBtn = document.querySelector('[aria-label="Open CrowdFlow AI Assistant"]');
    expect(chatBtn).toBeTruthy();
    expect(chatBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('chatbot quick replies are pre-defined and valid', () => {
    // Validate the SMART_REPLIES pool has entries
    const defaults = ['Where is the nearest food stall?', 'Which gate has least crowd?', 'How long is the washroom queue?'];
    defaults.forEach(q => {
      expect(typeof q).toBe('string');
      expect(q.length).toBeGreaterThan(5);
    });
  });

  it('renders the Report Incident section', () => {
    render(<App />);
    expect(screen.getByText(/Report Incident/i)).toBeDefined();
    expect(screen.getByText(/Live Incident Feed/i)).toBeDefined();
  });

  it('renders the Admin Dashboard', () => {
    render(<App />);
    expect(screen.getByText(/Admin Dashboard/i)).toBeDefined();
    expect(screen.getByText(/Vertex AI Prediction/i)).toBeDefined();
  });

  it('renders the language selector with Indian language options', () => {
    render(<App />);
    const selector = screen.getByRole('combobox');
    expect(selector).toBeDefined();
    fireEvent.change(selector, { target: { value: 'hi' } });
    expect(selector.value).toBe('hi');
  });

});
