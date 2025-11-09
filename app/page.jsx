"use client";

import { useEffect, useRef, useState } from "react";

export default function Page() {
  const [tone, setTone] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(138);
  const [currentStep, setCurrentStep] = useState(0);

  // 16-step patterns for drums
  const [kick, setKick] = useState(() => Array(16).fill(false).map((_,i)=> i%4===0));
  const [snare, setSnare] = useState(() => Array(16).fill(false).map((_,i)=> i%8===4));
  const [hat, setHat] = useState(() => Array(16).fill(false).map((_,i)=> i%2===0));

  // Lead pattern (trance pluck gate) boolean gates; notes are arpeggiated automatically
  const [leadGate, setLeadGate] = useState(() => Array(16).fill(false).map((_,i)=> [0,1,2,5,8,9,10,13].includes(i)));
  const [scale, setScale] = useState("minor");
  const [root, setRoot] = useState("A");

  // Effects
  const [reverbWet, setReverbWet] = useState(0.25);
  const [delayWet, setDelayWet] = useState(0.22);
  const [filterCutoff, setFilterCutoff] = useState(8000);

  // Refs for audio nodes and live pattern snapshots to avoid stale closures
  const nodesRef = useRef({});
  const patternsRef = useRef({ kick: [], snare: [], hat: [], leadGate: [] });
  const loopRef = useRef(null);
  const recorderRef = useRef(null);

  useEffect(() => { patternsRef.current.kick = kick; }, [kick]);
  useEffect(() => { patternsRef.current.snare = snare; }, [snare]);
  useEffect(() => { patternsRef.current.hat = hat; }, [hat]);
  useEffect(() => { patternsRef.current.leadGate = leadGate; }, [leadGate]);

  // Lazy-load Tone.js only on client
  useEffect(() => {
    let mounted = true;
    import("tone").then((T) => {
      if (!mounted) return;
      setTone(T);
    });
    return () => { mounted = false; };
  }, []);

  // Initialize audio graph when Tone is available and user starts
  const initAudio = async () => {
    if (!tone) return;
    await tone.start();

    const kick = new tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 10,
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.2 },
    }).toDestination();

    const snNoise = new tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.0 },
    }).toDestination();

    const hats = new tone.MetalSynth({
      frequency: 200,
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4000,
      octaves: 1.5,
    }).toDestination();

    // Lead chain: PolySynth -> Filter -> Delay -> Reverb -> Destination
    const lead = new tone.PolySynth(tone.Synth, {
      maxPolyphony: 8,
      volume: -8,
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.005, decay: 0.2, sustain: 0.0, release: 0.3 },
    });

    const filter = new tone.Filter(filterCutoff, "lowpass");
    const delay = new tone.FeedbackDelay("8n", 0.35);
    const reverb = new tone.Reverb({ decay: 4.2, preDelay: 0.02, wet: reverbWet });
    delay.wet.value = delayWet;

    lead.chain(filter, delay, reverb, tone.Destination);

    nodesRef.current = { kick, snNoise, hats, lead, filter, delay, reverb };

    tone.Transport.bpm.value = bpm;
    tone.Transport.swing = 0.02;

    // 16th-note step sequencer loop
    let step = 0;
    loopRef.current = new tone.Loop((time) => {
      setCurrentStep(step);
      const p = patternsRef.current;
      // Drums
      if (p.kick[step]) kick.triggerAttackRelease("C1", "8n", time);
      if (p.snare[step]) snNoise.triggerAttackRelease("16n", time);
      if (p.hat[step]) hats.triggerAttackRelease("32n", time);

      // Lead arp gate ? simple arpeggio over the chosen scale
      if (p.leadGate[step]) {
        const chord = buildTranceChord(root, scale);
        const note = chord[step % chord.length];
        nodesRef.current.lead.triggerAttackRelease(note, "16n", time);
      }

      step = (step + 1) % 16;
    }, "16n");

    setIsStarted(true);
  };

  // Helpers
  const buildTranceChord = (rootNote, scaleName) => {
    // A simple progression: root triad + 7th split as arp
    const semis = {
      minor: [0, 3, 7, 10],
      major: [0, 4, 7, 11],
      dorian: [0, 2, 5, 9],
    }[scaleName] || [0, 3, 7, 10];
    const rootMidi = noteToMidi(rootNote + "4");
    const notes = semis.map((s) => midiToNote(rootMidi + s));
    // Repeat across two octaves for richer arp
    return [
      notes[0], notes[1], notes[2], notes[3],
      transpose(notes[0], 12), transpose(notes[1], 12), transpose(notes[2], 12), transpose(notes[3], 12),
    ];
  };

  const transpose = (note, semitones) => midiToNote(noteToMidi(note) + semitones);

  const noteToMidi = (note) => {
    // Parse like A#4 / Bb3 / C4
    const map = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
    const m = note.match(/^([A-G](?:#|b)?)(-?\d)$/);
    if (!m) return 60; // C4 fallback
    const [, n, o] = m;
    return (parseInt(o) + 1) * 12 + map[n];
  };
  const midiToNote = (midi) => {
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const name = names[midi % 12];
    const oct = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  };

  // Transport
  const play = async () => {
    if (!isStarted) await initAudio();
    if (!tone) return;
    if (loopRef.current && loopRef.current.state !== "started") {
      loopRef.current.start(0);
    }
    tone.Transport.start();
    setIsPlaying(true);
  };
  const stop = () => {
    if (!tone) return;
    tone.Transport.stop();
    if (loopRef.current) loopRef.current.stop(0);
    setCurrentStep(0);
    setIsPlaying(false);
  };

  // React to parameter changes
  useEffect(() => {
    if (!tone) return;
    tone.Transport.bpm.value = bpm;
  }, [bpm, tone]);

  useEffect(() => {
    const { filter, reverb, delay } = nodesRef.current;
    if (filter) filter.frequency.value = filterCutoff;
    if (reverb) reverb.wet.value = reverbWet;
    if (delay) delay.wet.value = delayWet;
  }, [filterCutoff, reverbWet, delayWet]);

  // Recording / Export
  const startRecording = async () => {
    if (!tone) return;
    const rec = new tone.Recorder();
    recorderRef.current = rec;
    tone.Destination.connect(rec);
    await rec.start();

    // Ensure transport runs for 8 bars
    if (!isPlaying) await play();
    const ms = tone.Time("8m").toSeconds() * 1000;
    setTimeout(async () => {
      const blob = await rec.stop();
      downloadBlob(blob, `trance-${Date.now()}.wav`);
    }, ms);
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  // Presets (localStorage)
  const savePreset = () => {
    const preset = { bpm, kick, snare, hat, leadGate, reverbWet, delayWet, filterCutoff, scale, root };
    localStorage.setItem("trance_preset", JSON.stringify(preset));
  };
  const loadPreset = () => {
    const s = localStorage.getItem("trance_preset");
    if (!s) return;
    try {
      const p = JSON.parse(s);
      setBpm(p.bpm ?? 138);
      setKick(p.kick ?? kick);
      setSnare(p.snare ?? snare);
      setHat(p.hat ?? hat);
      setLeadGate(p.leadGate ?? leadGate);
      setReverbWet(p.reverbWet ?? reverbWet);
      setDelayWet(p.delayWet ?? delayWet);
      setFilterCutoff(p.filterCutoff ?? filterCutoff);
      setScale(p.scale ?? scale);
      setRoot(p.root ?? root);
    } catch (e) { /* ignore */ }
  };

  const toggleStep = (track, index) => {
    const update = (arr, setter) => {
      const next = arr.slice(); next[index] = !next[index]; setter(next);
    };
    if (track === "kick") update(kick, setKick);
    else if (track === "snare") update(snare, setSnare);
    else if (track === "hat") update(hat, setHat);
    else if (track === "leadGate") update(leadGate, setLeadGate);
  };

  const setAll = (track, pattern) => {
    const pad = (arr) => (arr.length < 16 ? [...arr, ...Array(16 - arr.length).fill(false)] : arr).slice(0,16);
    if (track === "kick") setKick(pad(pattern));
    if (track === "snare") setSnare(pad(pattern));
    if (track === "hat") setHat(pad(pattern));
    if (track === "leadGate") setLeadGate(pad(pattern));
  };

  const DrumRow = ({ name, stateKey }) => {
    const arr = stateKey === "kick" ? kick : stateKey === "snare" ? snare : hat;
    return (
      <div className="track">
        <div className="track-name">{name}</div>
        {arr.map((on, i) => (
          <button key={i} className={`cell ${on ? "on" : ""} ${currentStep===i?"play":""}`} onClick={() => toggleStep(stateKey, i)}>
            {(i%4===0)?"|":""}
          </button>
        ))}
      </div>
    );
  };

  const LeadRow = () => (
    <div className="track">
      <div className="track-name">Lead</div>
      {leadGate.map((on, i) => (
        <button key={i} className={`cell ${on ? "on" : ""} ${currentStep===i?"play":""}`} onClick={() => toggleStep("leadGate", i)}>
          {(i%4===0)?"|":""}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid" style={{gridTemplateColumns:"1fr"}}>
      <div className="header">
        <h1 className="h1">Trance Studio</h1>
        <div className="badge">Web Audio ? Tone.js ? 16-step</div>
      </div>

      <div className="card">
        <div className="controls">
          <button className="btn primary" onClick={play} disabled={!tone || isPlaying}>Play</button>
          <button className="btn" onClick={stop} disabled={!tone}>Stop</button>
          <div className="row">
            <div className="label">BPM</div>
            <input className="slider" type="range" min="120" max="150" value={bpm} onChange={(e)=>setBpm(parseInt(e.target.value))} />
            <div className="pill">{bpm}</div>
          </div>
          <div className="row">
            <div className="label">Root</div>
            <select value={root} onChange={(e)=>setRoot(e.target.value)}>
              {"C C# D D# E F F# G G# A A# B".split(" ").map(n=> <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="label">Scale</div>
            <select value={scale} onChange={(e)=>setScale(e.target.value)}>
              {['minor','major','dorian'].map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className="btn" onClick={startRecording} disabled={!tone}>Record 8 bars</button>
        </div>
        <div className="sep" />
        <div className="controls group">
          <div className="row">
            <div className="label">Filter</div>
            <input className="slider" type="range" min="200" max="12000" value={filterCutoff} onChange={(e)=>setFilterCutoff(parseInt(e.target.value))} />
            <div className="pill">{Math.round(filterCutoff)} Hz</div>
          </div>
          <div className="row">
            <div className="label">Delay</div>
            <input className="slider" type="range" min="0" max="1" step="0.01" value={delayWet} onChange={(e)=>setDelayWet(parseFloat(e.target.value))} />
            <div className="pill">{Math.round(delayWet*100)}%</div>
          </div>
          <div className="row">
            <div className="label">Reverb</div>
            <input className="slider" type="range" min="0" max="1" step="0.01" value={reverbWet} onChange={(e)=>setReverbWet(parseFloat(e.target.value))} />
            <div className="pill">{Math.round(reverbWet*100)}%</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Sequencer</div>
        <div className="steps">
          <DrumRow name="Kick" stateKey="kick" />
          <DrumRow name="Snare" stateKey="snare" />
          <DrumRow name="Hats" stateKey="hat" />
          <LeadRow />
        </div>
        <div className="sep" />
        <div className="preset-row">
          <div className="label">Presets</div>
          <button className="btn" onClick={()=>{ setAll('kick', [true,false,false,false,true,false,false,false,true,false,false,false,true,false,false,false]); }}>4-on-the-floor Kick</button>
          <button className="btn" onClick={()=>{ setAll('snare', [false,false,false,false,true,false,false,false,false,false,false,false,true,false,false,false]); }}>Backbeat Snare</button>
          <button className="btn" onClick={()=>{ setAll('hat', Array(16).fill(0).map((_,i)=> i%2===0)); }}>Hi-hat 8ths</button>
          <button className="btn" onClick={()=>{ setAll('leadGate', [true,false,true,false,true,false,true,false,true,false,true,false,true,false,true,false]); }}>Lead Gate 8ths</button>
          <button className="btn" onClick={savePreset}>Save</button>
          <button className="btn" onClick={loadPreset}>Load</button>
        </div>
      </div>

      <div className="footer">Tip: Press Play to initialize audio. Recording will export a WAV of 8 bars.</div>
    </div>
  );
}
