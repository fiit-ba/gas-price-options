import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import WriteOption from './components/WriteOption';
import BuyOption from './components/BuyOption';
import MyOptions from './components/MyOptions';
import contractsInfo from './contracts/contracts.json';
import './App.css';

function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contracts, setContracts] = useState({});
  const [account, setAccount] = useState('');

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        
        // Initialize contracts
        const optionFactory = new ethers.Contract(
          contractsInfo.OptionFactory.address,
          contractsInfo.OptionFactory.abi,
          signer
        );
        const gasOptionPricing = new ethers.Contract(
          contractsInfo.GasOptionPricing.address,
          contractsInfo.GasOptionPricing.abi,
          signer
        );

        setProvider(provider);
        setSigner(signer);
        setAccount(accounts[0]);
        setContracts({
          optionFactory,
          gasOptionPricing
        });
      } catch (error) {
        console.error("Error connecting wallet:", error);
      }
    } else {
      alert('Please install MetaMask!');
    }
  };

  return (
    <Router>
      <div className="App">
        <nav className="navbar">
          <div className="navbar-brand">
            <Link to="/">Options Trading</Link>
          </div>
          <div className="navbar-links">
            <Link to="/write">Write Option</Link>
            <Link to="/buy">Buy Option</Link>
            <Link to="/my-options">My Options</Link>
            <button onClick={connectWallet}>
              {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
            </button>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={
            <main className="homepage">
              <h1>Welcome to Options Trading Platform</h1>
              <p>Your one-stop solution for options trading</p>
              
              <div className="features">
                <div className="feature-card">
                  <h2>Write Options</h2>
                  <p>Create and sell options contracts with customizable terms</p>
                </div>
                <div className="feature-card">
                  <h2>Buy Options</h2>
                  <p>Browse and purchase available options contracts</p>
                </div>
              </div>
            </main>
          } />
          <Route 
            path="/write" 
            element={
              <WriteOption 
                provider={provider}
                signer={signer}
                contracts={contracts}
              />
            } 
          />
          <Route 
            path="/buy" 
            element={
              <BuyOption 
                provider={provider}
                signer={signer}
                contracts={contracts}
              />
            } 
          />
          <Route 
            path="/my-options" 
            element={
              <MyOptions 
                provider={provider}
                signer={signer}
                contracts={contracts}
                account={account}
              />
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
