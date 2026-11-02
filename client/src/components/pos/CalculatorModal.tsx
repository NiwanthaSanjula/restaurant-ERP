import React, { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
  onUse?: (value: number) => void;
}

const CalculatorModal: React.FC<Props> = ({ onClose, onUse }) => {
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [history, setHistory] = useState<Array<{ expression: string; result: number }>>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        inputNumber(e.key);
      } else if (e.key === '.') {
        inputDecimal();
      } else if (e.key === '+') {
        performOperation('+');
      } else if (e.key === '-') {
        performOperation('-');
      } else if (e.key === '*') {
        performOperation('×');
      } else if (e.key === '/') {
        e.preventDefault();
        performOperation('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        calculate();
      } else if (e.key === 'Escape') {
        clear();
      } else if (e.key === 'Backspace') {
        deleteLast();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [display, previousValue, operation, waitingForNewValue, expression]);

  const inputNumber = (num: string) => {
    if (showResult) {
      // If showing result, start fresh
      clear();
      setDisplay(num);
      return;
    }

    if (waitingForNewValue) {
      setDisplay(num);
      setWaitingForNewValue(false);
      // Update expression to show second value after operation
      if (operation && previousValue !== null) {
        setExpression(`${previousValue} ${operation} ${num}`);
      }
    } else {
      const newDisplay = display === '0' ? num : display + num;
      setDisplay(newDisplay);
      // Update expression to show second value as it's being typed
      if (operation && previousValue !== null) {
        setExpression(`${previousValue} ${operation} ${newDisplay}`);
      }
    }
  };

  const inputDecimal = () => {
    if (showResult) {
      clear();
      setDisplay('0.');
      return;
    }

    if (waitingForNewValue) {
      setDisplay('0.');
      setWaitingForNewValue(false);
      if (operation && previousValue !== null) {
        setExpression(`${previousValue} ${operation} 0.`);
      }
    } else if (display.indexOf('.') === -1) {
      const newDisplay = display + '.';
      setDisplay(newDisplay);
      if (operation && previousValue !== null) {
        setExpression(`${previousValue} ${operation} ${newDisplay}`);
      }
    }
  };

  const clear = () => {
    setDisplay('0');
    setExpression('');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
    setShowResult(false);
  };

  const deleteLast = () => {
    if (showResult) {
      clear();
      return;
    }

    if (display.length > 1) {
      const newDisplay = display.slice(0, -1);
      setDisplay(newDisplay);
      // Update expression if we're entering second value
      if (operation && previousValue !== null) {
        setExpression(`${previousValue} ${operation} ${newDisplay}`);
      }
    } else {
      setDisplay('0');
      if (operation && previousValue !== null) {
        setExpression(`${previousValue} ${operation}`);
      }
    }
  };

  const performOperation = (nextOperation: string) => {
    if (showResult) {
      // If showing result, use result as first value
      const resultValue = parseFloat(display);
      setPreviousValue(resultValue);
      setOperation(nextOperation);
      setExpression(`${resultValue} ${nextOperation}`);
      setWaitingForNewValue(true);
      setShowResult(false);
      return;
    }

    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
      setExpression(`${inputValue} ${nextOperation}`);
    } else if (operation) {
      // Calculate intermediate result
      const currentValue = previousValue || 0;
      try {
        const newValue = calculateValue(currentValue, inputValue, operation);
        setDisplay(String(newValue));
        setPreviousValue(newValue);
        setExpression(`${newValue} ${nextOperation}`);
      } catch (error) {
        setDisplay('Error');
        setExpression('');
        setPreviousValue(null);
        setOperation(null);
        setWaitingForNewValue(false);
        return;
      }
    }

    setWaitingForNewValue(true);
    setOperation(nextOperation);
  };

  const calculateValue = (firstValue: number, secondValue: number, op: string): number => {
    switch (op) {
      case '+':
        return firstValue + secondValue;
      case '-':
        return firstValue - secondValue;
      case '×':
        return firstValue * secondValue;
      case '÷':
        if (secondValue === 0) {
          throw new Error('Cannot divide by zero');
        }
        return firstValue / secondValue;
      default:
        return secondValue;
    }
  };

  const calculate = () => {
    if (showResult) {
      // If already showing result, do nothing or clear
      return;
    }

    if (operation && previousValue !== null) {
      const inputValue = parseFloat(display);
      
      try {
        const result = calculateValue(previousValue, inputValue, operation);
        // Show full expression with equals and answer
        const fullExpression = `${previousValue} ${operation} ${inputValue} = ${result}`;
        setExpression(fullExpression);
        setDisplay(String(result));
        setShowResult(true);
        
        // Add to history
        setHistory(prev => {
          const newHistory = [{ expression: fullExpression, result }, ...prev];
          // Keep only last 50 calculations
          return newHistory.slice(0, 50);
        });
        
        if (onUse) {
          onUse(result);
        }
      } catch (error) {
        const fullExpression = `${previousValue} ${operation} ${inputValue} = Error`;
        setExpression(fullExpression);
        setDisplay('Error');
        setShowResult(true);
      }
    }
  };

  const handleNumberClick = (num: string) => inputNumber(num);
  const handleDecimalClick = () => inputDecimal();
  const handleOperationClick = (op: string) => performOperation(op);
  const handleEqualsClick = () => calculate();
  const handleClearClick = () => clear();
  const handleDeleteClick = () => deleteLast();
  const handleHistoryClick = () => setShowHistory(true);
  const handleHistoryItemClick = (result: number) => {
    setDisplay(String(result));
    setExpression('');
    setPreviousValue(null);
    setOperation(null);
    setWaitingForNewValue(false);
    setShowResult(true);
    setShowHistory(false);
  };
  const handleClearHistory = () => {
    setHistory([]);
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {showHistory ? (
          /* History Panel - Same size as calculator */
          <>
            {/* History Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
              <h2 className="text-white text-xl font-bold">History</h2>
              <div className="flex gap-2">
                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-white hover:bg-white/20 rounded-lg px-3 py-1.5 text-sm transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
                  aria-label="Close history"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* History List */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 min-h-0 custom-scrollbar">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                  <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg">No calculations yet</p>
                  <p className="text-sm mt-1">Your calculation history will appear here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => handleHistoryItemClick(item.result)}
                      className="w-full text-left p-4 bg-white hover:bg-gray-100 rounded-xl transition-colors border border-gray-200 hover:border-purple-300 group shadow-sm"
                    >
                      <div className="text-gray-600 text-sm font-mono mb-1">{item.expression}</div>
                      <div className="text-[#1f3b63] text-xl font-bold group-hover:text-purple-600">
                        = {item.result}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Calculator Content */
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#1f3b63] to-[#243b53] px-6 py-4 flex items-center justify-between flex-shrink-0">
              <h2 className="text-white text-xl font-bold">Calculator</h2>
              <button 
                onClick={onClose}
                className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
                aria-label="Close calculator"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Display */}
            <div className="bg-gray-900 p-6 flex-shrink-0">
              <div className="text-right">
                {/* Expression line - shows the full expression string */}
                <div className="text-gray-400 text-lg mb-2 min-h-[28px] font-mono">
                  {expression || (previousValue !== null && operation ? `${previousValue} ${operation}` : '')}
                </div>
                {/* Result line - shows current input or result */}
                <div className="text-white text-4xl font-mono font-bold break-all">
                  {display}
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="p-4 bg-gray-50 flex-shrink-0">
          <div className="grid grid-cols-4 gap-3">
            {/* Row 1 */}
            <button
              onClick={handleClearClick}
              className="h-14 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-md text-sm"
            >
              Clear (C)
            </button>
            <button
              onClick={handleHistoryClick}
              className="h-14 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-colors shadow-md flex items-center justify-center"
              title="History"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            <button
              onClick={handleDeleteClick}
              className="h-14 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors shadow-md"
            >
              ⌫
            </button>
            <button
              onClick={() => handleOperationClick('÷')}
              className="h-14 bg-[#1f3b63] hover:bg-[#243b53] text-white font-bold text-xl rounded-xl transition-colors shadow-md"
            >
              ÷
            </button>

            {/* Row 2 */}
            <button onClick={() => handleNumberClick('7')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              7
            </button>
            <button onClick={() => handleNumberClick('8')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              8
            </button>
            <button onClick={() => handleNumberClick('9')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              9
            </button>
            <button
              onClick={() => handleOperationClick('×')}
              className="h-14 bg-[#1f3b63] hover:bg-[#243b53] text-white font-bold text-xl rounded-xl transition-colors shadow-md"
            >
              ×
            </button>

            {/* Row 3 */}
            <button onClick={() => handleNumberClick('4')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              4
            </button>
            <button onClick={() => handleNumberClick('5')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              5
            </button>
            <button onClick={() => handleNumberClick('6')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              6
            </button>
            <button
              onClick={() => handleOperationClick('-')}
              className="h-14 bg-[#1f3b63] hover:bg-[#243b53] text-white font-bold text-xl rounded-xl transition-colors shadow-md"
            >
              −
            </button>

            {/* Row 4 */}
            <button onClick={() => handleNumberClick('1')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              1
            </button>
            <button onClick={() => handleNumberClick('2')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              2
            </button>
            <button onClick={() => handleNumberClick('3')} className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              3
            </button>
            <button
              onClick={() => handleOperationClick('+')}
              className="h-14 bg-[#1f3b63] hover:bg-[#243b53] text-white font-bold text-xl rounded-xl transition-colors shadow-md"
            >
              +
            </button>

            {/* Row 5 */}
            <button onClick={() => handleNumberClick('0')} className="col-span-2 h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200">
              0
            </button>
            <button
              onClick={handleDecimalClick}
              className="h-14 bg-white hover:bg-gray-100 text-gray-800 font-bold text-xl rounded-xl transition-colors shadow-md border border-gray-200"
            >
              .
            </button>
            <button
              onClick={handleEqualsClick}
              className="h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-xl rounded-xl transition-colors shadow-md"
            >
              =
            </button>
          </div>

              {/* Use Result Button */}
              {onUse && (
                <button
                  onClick={() => {
                    const value = parseFloat(display);
                    if (!isNaN(value) && display !== 'Error') {
                      onUse(value);
                      onClose();
                    }
                  }}
                  className="w-full mt-4 h-12 bg-[#1f3b63] hover:bg-[#243b53] text-white font-bold rounded-xl transition-colors shadow-md"
                >
                  Use Result
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CalculatorModal;
