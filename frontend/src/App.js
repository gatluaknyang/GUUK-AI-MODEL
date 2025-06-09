import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Use environment variable for API URL (deployment ready)
const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

// --- API Helper Functions ---
const api = {
  register: (data) => {
    return fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  login: (data) => {
    return fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  getHistory: (user, token) => {
    return fetch(`${API_URL}/user/history?user=${user}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).then(res => res.json());
  },
  saveTextContent: (data, token) => {
     return fetch(`${API_URL}/save-content`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  uploadMedia: (formData, token) => {
    return fetch(`${API_URL}/upload-media?${new URLSearchParams({
        user: formData.get('user'),
        title: formData.get('title'),
        media_type: formData.get('media_type'),
        prompt: formData.get('prompt') || ''
    })}`, {
        method: 'POST',
        body: formData,
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
    }).then(res => res.json());
  },
  listQuizzes: (token) => {
    return fetch(`${API_URL}/quiz/list`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).then(res => res.json());
  },
  getQuiz: (quizId, token) => {
    return fetch(`${API_URL}/quiz/${quizId}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).then(res => res.json());
  },
  submitQuiz: (quizId, answers, token) => {
    return fetch(`${API_URL}/quiz/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ quiz_id: quizId, answers }),
    }).then(res => res.json());
  },
  getQuizResults: (user, token) => {
    // Fetch user's quiz results from Firestore
    // We'll use /user/history and filter for quiz_results
    return fetch(`${API_URL}/user/history?user=${user}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    }).then(res => res.json()).then(data =>
      Array.isArray(data) ? data.filter(item => item.quiz_id && item.score !== undefined) : []
    );
  },
  createQuiz: (quiz, token) => {
    return fetch(`${API_URL}/quiz/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(quiz),
    }).then(res => res.json());
  },
  generateTextAdvanced: (data, token) => {
    return fetch(`${API_URL}/generate-text-advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  generateImageAdvanced: (data, token) => {
    return fetch(`${API_URL}/generate-image-advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  generateVideoAdvanced: (data, token) => {
    return fetch(`${API_URL}/generate-video-advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  generateCartoonAdvanced: (data, token) => {
    return fetch(`${API_URL}/generate-cartoon-advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
  generateVoiceoverAdvanced: (data, token) => {
    return fetch(`${API_URL}/generate-voiceover-advanced`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(data),
    }).then(res => res.json());
  },
};

// --- Providers and Models ---
const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
  { value: 'manus', label: 'Manus' },
];
const MODELS = {
  openai: [
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'dall-e-3', label: 'DALL-E 3 (image)' },
  ],
  gemini: [
    { value: 'gemini-pro', label: 'Gemini Pro' },
    { value: 'gemini-image', label: 'Gemini Image' },
  ],
  claude: [
    { value: 'claude-3', label: 'Claude 3' },
  ],
  manus: [
    { value: 'manus-1', label: 'Manus 1' },
  ],
};

// --- Components ---

function Register({ onRegister, onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.register({ username, password, email });
      if (response.status === 'registered') {
        setSuccess('Registration successful! You can now log in.');
        setTimeout(() => onRegister(username), 1000);
      } else {
        setError(response.detail || 'Registration failed.');
      }
    } catch (err) {
      setError('Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="p-8 bg-gray-800 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2">GUUK AI</h1>
        <p className="text-center text-gray-400 mb-6">Register a New Account</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button type="submit" disabled={loading} className="w-full mt-4 px-4 py-2 bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-500 font-semibold transition-colors">
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>
        {error && <div className="bg-red-700 text-white p-2 rounded mt-4" role="alert">{error}</div>}
        {success && <div className="bg-green-700 text-white p-2 rounded mt-4" role="status">{success}</div>}
        <button onClick={onSwitchToLogin} className="mt-4 text-purple-400 underline">Already have an account? Log in</button>
      </div>
    </div>
  );
}

function Login({ onLogin, onSwitchToRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required.');
      return;
    }
    setLoading(true);
    try {
      const response = await api.login({ username, password });
      if (response.access_token) {
        onLogin(username, response.access_token);
      } else {
        setError(response.detail || 'Login failed.');
      }
    } catch (error) {
      setError('Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="p-8 bg-gray-800 rounded-xl shadow-lg w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2">GUUK AI</h1>
        <p className="text-center text-gray-400 mb-6">Login to Continue</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <button type="submit" disabled={loading} className="w-full mt-4 px-4 py-2 bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-500 font-semibold transition-colors">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        {error && <div className="bg-red-700 text-white p-2 rounded mt-4" role="alert">{error}</div>}
        <button onClick={onSwitchToRegister} className="mt-4 text-purple-400 underline">Don't have an account? Register</button>
      </div>
    </div>
  );
}

function QuizList({ token, onTakeQuiz }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.listQuizzes(token)
      .then(data => setQuizzes(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load quizzes'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Quiz List">
      <h2 className="text-2xl font-semibold mb-4">Available Quizzes</h2>
      {loading ? <p>Loading quizzes...</p> : error ? <p className="text-red-400">{error}</p> : (
        <ul className="space-y-4">
          {quizzes.map(q => (
            <li key={q.id} className="bg-gray-700 p-4 rounded flex justify-between items-center">
              <div>
                <span className="font-bold text-lg text-purple-300">{q.title}</span>
                <span className="ml-4 text-gray-400 text-sm">by {q.created_by}</span>
              </div>
              <button onClick={() => onTakeQuiz(q.id)} className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 text-white">Take Quiz</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuizTake({ quizId, token, onBack, onSubmitResult }) {
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getQuiz(quizId, token)
      .then(data => {
        setQuiz(data);
        setAnswers(Array(data.questions?.length).fill(null));
      })
      .catch(() => setError('Failed to load quiz.'));
  }, [quizId, token]);

  const handleChange = (qIdx, optIdx) => {
    setAnswers(ans => ans.map((a, i) => i === qIdx ? optIdx : a));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (answers.some(a => a === null)) {
      setError('Please answer all questions.');
      return;
    }
    setError('');
    const result = await api.submitQuiz(quizId, answers, token);
    setScore(result.score);
    setSubmitted(true);
    if (onSubmitResult) onSubmitResult(result);
  };

  if (!quiz) return <div className="bg-gray-800 p-6 rounded-xl mb-8">Loading quiz...</div>;

  return (
    <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Take Quiz">
      <h2 className="text-2xl font-semibold mb-4">{quiz.title}</h2>
      <form onSubmit={handleSubmit}>
        {quiz.questions.map((q, idx) => (
          <div key={idx} className="mb-6">
            <p className="font-bold mb-2">{idx + 1}. {q.question}</p>
            <div className="space-y-2">
              {q.options.map((opt, oidx) => (
                <label key={oidx} className="block">
                  <input
                    type="radio"
                    name={`q${idx}`}
                    value={oidx}
                    checked={answers[idx] === oidx}
                    onChange={() => handleChange(idx, oidx)}
                    className="mr-2"
                  />
                  {opt}
                </label>
              ))}
            </div>
          </div>
        ))}
        {error && <div className="text-red-400 mb-2">{error}</div>}
        {!submitted ? (
          <button type="submit" className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 text-white">Submit Quiz</button>
        ) : (
          <div className="mt-4 text-green-400 font-bold">Your Score: {score} / {quiz.questions.length}</div>
        )}
      </form>
      <button onClick={onBack} className="mt-4 text-purple-400 underline">Back to Quizzes</button>
    </section>
  );
}

function QuizResults({ user, token }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getQuizResults(user, token)
      .then(data => setResults(data))
      .finally(() => setLoading(false));
  }, [user, token]);

  return (
    <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Quiz Results">
      <h2 className="text-2xl font-semibold mb-4">Your Quiz Results</h2>
      {loading ? <p>Loading results...</p> : (
        <ul className="space-y-4">
          {results.map((r, idx) => (
            <li key={idx} className="bg-gray-700 p-4 rounded">
              <div className="font-bold text-lg text-purple-300">Quiz: {r.quiz_id}</div>
              <div>Score: {r.score} / {r.total}</div>
              <div className="text-xs text-gray-400">Submitted: {new Date(r.submitted_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QuizCreate({ user, token, onCreated }) {
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState([
    { question: '', options: ['', '', '', ''], answer: 0 }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleQuestionChange = (idx, field, value) => {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, [field]: value } : q));
  };
  const handleOptionChange = (qIdx, oIdx, value) => {
    setQuestions(qs => qs.map((q, i) => i === qIdx ? { ...q, options: q.options.map((o, oi) => oi === oIdx ? value : o) } : q));
  };
  const handleAddQuestion = () => {
    setQuestions(qs => [...qs, { question: '', options: ['', '', '', ''], answer: 0 }]);
  };
  const handleRemoveQuestion = (idx) => {
    setQuestions(qs => qs.length > 1 ? qs.filter((_, i) => i !== idx) : qs);
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!title.trim() || questions.some(q => !q.question.trim() || q.options.some(o => !o.trim()))) {
      setError('Please fill out all fields.');
      return;
    }
    setLoading(true);
    const quiz = { title, questions };
    const res = await api.createQuiz(quiz, token);
    if (res.status === 'created') {
      setSuccess('Quiz created!');
      setTitle('');
      setQuestions([{ question: '', options: ['', '', '', ''], answer: 0 }]);
      if (onCreated) onCreated();
    } else {
      setError(res.detail || 'Failed to create quiz.');
    }
    setLoading(false);
  };
  return (
    <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Create Quiz">
      <h2 className="text-2xl font-semibold mb-4">Create a New Quiz</h2>
      <form onSubmit={handleSubmit}>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz Title" className="w-full p-2 mb-4 rounded bg-gray-700 text-white" />
        {questions.map((q, idx) => (
          <div key={idx} className="mb-6 border-b border-gray-600 pb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold">Question {idx + 1}</span>
              <button type="button" onClick={() => handleRemoveQuestion(idx)} className="text-red-400 text-xs">Remove</button>
            </div>
            <input type="text" value={q.question} onChange={e => handleQuestionChange(idx, 'question', e.target.value)} placeholder="Question text" className="w-full p-2 mb-2 rounded bg-gray-700 text-white" />
            {q.options.map((opt, oidx) => (
              <div key={oidx} className="flex items-center mb-1">
                <input type="radio" name={`answer${idx}`} checked={q.answer === oidx} onChange={() => handleQuestionChange(idx, 'answer', oidx)} className="mr-2" />
                <input type="text" value={opt} onChange={e => handleOptionChange(idx, oidx, e.target.value)} placeholder={`Option ${oidx + 1}`} className="flex-1 p-2 rounded bg-gray-700 text-white" />
                {q.answer === oidx && <span className="ml-2 text-green-400 text-xs">Correct</span>}
              </div>
            ))}
          </div>
        ))}
        <button type="button" onClick={handleAddQuestion} className="mb-4 px-3 py-1 bg-purple-700 rounded hover:bg-purple-800 text-white text-sm">Add Question</button>
        {error && <div className="text-red-400 mb-2">{error}</div>}
        {success && <div className="text-green-400 mb-2">{success}</div>}
        <button type="submit" disabled={loading} className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 text-white">{loading ? 'Creating...' : 'Create Quiz'}</button>
      </form>
    </section>
  );
}

function Dashboard({ user, token, onLogout }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Quiz UI state
  const [quizView, setQuizView] = useState('list');
  const [activeQuizId, setActiveQuizId] = useState(null);

  // Advanced generation state (unique names)
  const [genType, setGenType] = useState('text');
  const [genPrompt, setGenPrompt] = useState('');
  const [genProvider, setGenProvider] = useState('openai');
  const [genModel, setGenModel] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [genSuccess, setGenSuccess] = useState("");

  useEffect(() => {
    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        const data = await api.getHistory(user, token);
        setHistory(Array.isArray(data) ? data : []);
      } catch (error) {
        setError("Failed to fetch history");
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };
    fetchHistory();
  }, [user, token]);

  const handleFileUpload = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!file || !title) {
        setError("Please provide a title and select a file.");
        return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('user', user);
    formData.append('title', title);
    formData.append('media_type', file.type.split('/')[0]); // 'image' or 'video'
    formData.append('file', file);
    try {
        const result = await api.uploadMedia(formData, token);
        if(result.url) {
            setHistory(prev => [result, ...prev]);
            setTitle('');
            setFile(null);
            setSuccess("Upload successful!");
            e.target.reset();
        } else {
            setError("Upload failed: " + (result.detail || 'Unknown error'));
        }
    } catch (error) {
        setError("An error occurred during upload.");
    } finally {
        setUploading(false);
    }
  }

  // Advanced generation handler
  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenError("");
    setGenSuccess("");
    setGenLoading(true);
    let result;
    const data = { user, prompt: genPrompt, provider: genProvider, model: genModel };
    try {
      if (genType === 'text') {
        result = await api.generateTextAdvanced(data, token);
      } else if (genType === 'image') {
        result = await api.generateImageAdvanced(data, token);
      } else if (genType === 'video') {
        result = await api.generateVideoAdvanced(data, token);
      } else if (genType === 'animation') {
        result = await api.generateCartoonAdvanced(data, token);
      } else if (genType === 'voiceover') {
        result = await api.generateVoiceoverAdvanced(data, token);
      }
      if (result && result.entry) {
        setHistory(prev => [result.entry, ...prev]);
        setGenSuccess('Generation successful!');
        setGenPrompt('');
      } else {
        setGenError(result?.detail || 'Generation failed.');
      }
    } catch (err) {
      setGenError('An error occurred during generation.');
    } finally {
      setGenLoading(false);
    }
  };

  // Group content by type for accessibility
  const grouped = history.reduce((acc, item) => {
    const type = item.media_type || item.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  // Add a handler to add generated content to history
  const handleGenerated = (entry) => {
    setHistory(prev => [entry, ...prev]);
  };

  // Helper for download
  const handleDownload = (item) => {
    if (item.media_type === 'image' || item.media_type === 'animation') {
      const link = document.createElement('a');
      link.href = item.storage_url;
      link.download = item.title || 'downloaded-image';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (item.media_type === 'video') {
      const link = document.createElement('a');
      link.href = item.storage_url;
      link.download = item.title || 'downloaded-video';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (item.type === 'text' || item.output) {
      const blob = new Blob([item.output || ''], { type: 'text/plain' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = (item.title || 'generated-text') + '.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Admin/teacher check (simple username check)
  const isAdmin = user === 'admin' || user === 'teacher';

  return (
    <div className="bg-gray-900 min-h-screen text-white p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Welcome, <span className="text-purple-400">{user}</span>!</h1>
        <button onClick={onLogout} className="px-4 py-2 bg-gray-700 hover:bg-red-600 rounded-md transition-colors" aria-label="Logout">Logout</button>
      </header>

      {/* Feedback messages */}
      {error && <div className="bg-red-700 text-white p-2 rounded mb-4" role="alert">{error}</div>}
      {success && <div className="bg-green-700 text-white p-2 rounded mb-4" role="status">{success}</div>}

      {/* Media Uploader */}
      <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Upload Media">
        <h2 className="text-2xl font-semibold mb-4">Upload Media</h2>
        <form onSubmit={handleFileUpload}>
          <input type="text" placeholder="Title for your media" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 bg-gray-700 rounded-md mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500" aria-label="Media Title" />
          <input type="file" accept="image/*,video/*" onChange={e => setFile(e.target.files[0])} className="w-full p-3 bg-gray-700 rounded-md mb-4 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200" aria-label="Select file to upload" />
          <button type="submit" disabled={uploading} className="w-full px-4 py-3 bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-500 font-semibold transition-colors" aria-label="Upload Now">
            {uploading ? 'Uploading...' : 'Upload Now'}
          </button>
        </form>
      </section>

      {/* Advanced Generation Forms */}
      <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Generate Content">
        <h2 className="text-2xl font-semibold mb-4">Generate Content (Advanced)</h2>
        <form onSubmit={handleGenerate} className="flex flex-col md:flex-row gap-4 items-center">
          <select value={genType} onChange={e => { setGenType(e.target.value); setGenModel(''); }} className="p-2 rounded bg-gray-700 text-white" aria-label="Content Type">
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="animation">Cartoon/Animation</option>
            <option value="voiceover">Voiceover</option>
          </select>
          <select value={genProvider} onChange={e => { setGenProvider(e.target.value); setGenModel(''); }} className="p-2 rounded bg-gray-700 text-white" aria-label="AI Provider">
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {/* Model selection, optional */}
          <select value={genModel} onChange={e => setGenModel(e.target.value)} className="p-2 rounded bg-gray-700 text-white" aria-label="Model">
            <option value="">Default Model</option>
            {(MODELS[genProvider] || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input
            type="text"
            value={genPrompt}
            onChange={e => setGenPrompt(e.target.value)}
            placeholder="Enter a prompt (e.g. 'A cartoon cat learning numbers')"
            className="flex-1 p-2 rounded bg-gray-700 text-white"
            aria-label="Prompt"
          />
          <button type="submit" disabled={genLoading || !genPrompt.trim()} className="px-4 py-2 bg-purple-600 rounded-md hover:bg-purple-700 disabled:bg-gray-500 font-semibold transition-colors" aria-label="Generate">
            {genLoading ? "Generating..." : "Generate"}
          </button>
        </form>
        {genError && <div className="text-red-400 mt-2">{genError}</div>}
        {genSuccess && <div className="text-green-400 mt-2">{genSuccess}</div>}
      </section>

      {/* Quizzes Section */}
      <section className="mb-8">
        {isAdmin && quizView === 'list' && <QuizCreate user={user} token={token} onCreated={() => setQuizView('list')} />}
        {quizView === 'list' && <QuizList token={token} onTakeQuiz={id => { setActiveQuizId(id); setQuizView('take'); }} />}
        {quizView === 'take' && <QuizTake quizId={activeQuizId} token={token} onBack={() => setQuizView('list')} onSubmitResult={() => setQuizView('results')} />}
        {quizView === 'results' && <QuizResults user={user} token={token} />}
        {quizView !== 'results' && <button onClick={() => setQuizView('results')} className="mt-4 text-purple-400 underline">View My Quiz Results</button>}
        {quizView === 'results' && <button onClick={() => setQuizView('list')} className="mt-4 text-purple-400 underline">Back to Quiz List</button>}
      </section>

      {/* Grouped History Section for Accessibility with advanced previews */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Your Content History</h2>
        {Object.keys(grouped).map(type => (
          <div key={type} className="mb-8">
            <h3 className="text-xl font-bold mb-2 capitalize">{type.replace('_', ' ')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {grouped[type].map((item, index) => (
                <div key={index} className="bg-gray-800 p-4 rounded-lg shadow-md" tabIndex={0} aria-label={item.title || item.type}>
                  <h4 className="font-bold text-lg mb-2 text-purple-300">{item.title || item.type || "Text Generation"}</h4>
                  {item.storage_url && item.media_type === 'image' && <img src={item.storage_url} alt={item.prompt || item.title || 'Generated image'} className="rounded-md mb-2 w-full h-48 object-cover" />}
                  {item.storage_url && item.media_type === 'video' && <video src={item.storage_url} controls className="rounded-md mb-2 w-full h-48 object-cover" aria-label={item.prompt || item.title || 'Generated video'}><track kind="captions" /></video>}
                  {item.storage_url && item.media_type === 'animation' && <img src={item.storage_url} alt={item.prompt || item.title || 'Generated animation'} className="rounded-md mb-2 w-full h-48 object-cover" />}
                  {item.storage_url && item.media_type === 'audio' && <audio src={item.storage_url} controls className="w-full mb-2" aria-label={item.prompt || item.title || 'Generated voiceover'} />}
                  {item.prompt && <p className="text-sm text-gray-400"><span className="font-semibold">Prompt:</span> {item.prompt}</p>}
                  {item.output && <p className="text-sm text-gray-300"><span className="font-semibold">Output:</span> {item.output}</p>}
                  {item.provider && <p className="text-xs text-blue-400 mt-1">Provider: {item.provider}</p>}
                  <p className="text-xs text-gray-500 mt-3">{new Date(item.created_at).toLocaleString()}</p>
                  {/* Download button */}
                  <button onClick={() => handleDownload(item)} className="mt-2 px-3 py-1 bg-purple-700 rounded hover:bg-purple-800 text-white text-sm" aria-label="Download content">
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
      {/* Accessibility & UI/UX Verification Checklist */}
      <section className="bg-gray-800 p-6 rounded-xl mb-8" aria-label="Accessibility and UX Verification">
        <h2 className="text-2xl font-semibold mb-4">Accessibility &amp; UI/UX Verification</h2>
        <ul className="list-disc pl-6 space-y-2 text-gray-200">
          <li><input type="checkbox" aria-label="Keyboard navigation" className="mr-2" /> All interactive elements are accessible via keyboard (Tab/Shift+Tab).</li>
          <li><input type="checkbox" aria-label="Screen reader labels" className="mr-2" /> All forms, buttons, and media have clear ARIA labels and roles.</li>
          <li><input type="checkbox" aria-label="Color contrast" className="mr-2" /> Color contrast meets WCAG AA standards for text and UI elements.</li>
          <li><input type="checkbox" aria-label="Error and success messages" className="mr-2" /> Error and success messages are visible and announced to screen readers.</li>
          <li><input type="checkbox" aria-label="Responsive layout" className="mr-2" /> Layout is responsive and works on mobile, tablet, and desktop.</li>
          <li><input type="checkbox" aria-label="Loading indicators" className="mr-2" /> Loading indicators are present for all async actions.</li>
          <li><input type="checkbox" aria-label="Provider/model selection" className="mr-2" /> Provider/model selection and previews work for all content types.</li>
          <li><input type="checkbox" aria-label="Download and upload" className="mr-2" /> Download and upload features work for all supported media types.</li>
        </ul>
        <p className="mt-4 text-green-400 font-semibold">If all boxes are checked, your app is ready for deployment!</p>
      </section>
    </div>
  );
}

// --- Main App Component ---

function App() {
  const [user, setUser] = useState(() => localStorage.getItem("user") || "");
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [showRegister, setShowRegister] = useState(false);

  const handleLogin = (username, token) => {
    setUser(username);
    setToken(token);
    localStorage.setItem("user", username);
    localStorage.setItem("token", token);
  };

  const handleLogout = () => {
    setUser("");
    setToken("");
    localStorage.removeItem("user");
    localStorage.removeItem("token");
  };

  const handleRegister = (username) => {
    setShowRegister(false);
    setUser(username);
  };

  return (
    <BrowserRouter>
      <Routes>
        {!user ? (
          showRegister ? (
            <Route path="*" element={<Register onRegister={handleRegister} onSwitchToLogin={() => setShowRegister(false)} />} />
          ) : (
            <Route path="*" element={<Login onLogin={handleLogin} onSwitchToRegister={() => setShowRegister(true)} />} />
          )
        ) : (
          <>
            <Route path="/" element={<Dashboard user={user} token={token} onLogout={handleLogout} />} />
            <Route path="/dashboard" element={<Dashboard user={user} token={token} onLogout={handleLogout} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;
