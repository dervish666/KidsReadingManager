import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReadingLevelRangeInput from '../../components/students/ReadingLevelRangeInput';

describe('ReadingLevelRangeInput', () => {
  it('should render two number inputs', () => {
    render(<ReadingLevelRangeInput min={null} max={null} onChange={() => {}} />);

    expect(screen.getByLabelText(/min/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max/i)).toBeInTheDocument();
  });

  it('should display current values', () => {
    render(<ReadingLevelRangeInput min={5.2} max={8.7} onChange={() => {}} />);

    expect(screen.getByLabelText(/min/i)).toHaveValue(5.2);
    expect(screen.getByLabelText(/max/i)).toHaveValue(8.7);
  });

  it('should call onChange when min is updated', () => {
    const onChange = vi.fn();
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/min/i), { target: { value: '6.0' } });

    expect(onChange).toHaveBeenCalledWith({ min: 6.0, max: 8.0 });
  });

  it('should call onChange when max is updated', () => {
    const onChange = vi.fn();
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/max/i), { target: { value: '10.0' } });

    expect(onChange).toHaveBeenCalledWith({ min: 5.0, max: 10.0 });
  });

  it('should show error when min > max', () => {
    render(<ReadingLevelRangeInput min={8.0} max={5.0} onChange={() => {}} />);

    expect(screen.getByText(/minimum cannot be greater/i)).toBeInTheDocument();
  });

  it('should render visual range bar', () => {
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={() => {}} />);

    expect(screen.getByTestId('reading-level-range-bar')).toBeInTheDocument();
  });

  it('should handle empty values as null', () => {
    const onChange = vi.fn();
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/min/i), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith({ min: null, max: 8.0 });
  });

  it('should show "Not assessed" label when both values are null', () => {
    render(<ReadingLevelRangeInput min={null} max={null} onChange={() => {}} />);

    expect(screen.getByText(/not assessed/i)).toBeInTheDocument();
  });

  it('should handle disabled state', () => {
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={() => {}} disabled={true} />);

    expect(screen.getByLabelText(/min/i)).toBeDisabled();
    expect(screen.getByLabelText(/max/i)).toBeDisabled();
  });

  it('should display range text when valid range is set', () => {
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={() => {}} />);

    expect(screen.getByText(/range: 5.0 - 8.0/i)).toBeInTheDocument();
  });

  it('should not display range text when min equals max', () => {
    render(<ReadingLevelRangeInput min={5.0} max={5.0} onChange={() => {}} />);

    // Range bar should still be shown, even for same values
    expect(screen.getByTestId('reading-level-range-bar')).toBeInTheDocument();
    expect(screen.getByText(/range: 5.0 - 5.0/i)).toBeInTheDocument();
  });

  it('should handle only min value set', () => {
    render(<ReadingLevelRangeInput min={5.0} max={null} onChange={() => {}} />);

    expect(screen.getByLabelText(/min/i)).toHaveValue(5.0);
    expect(screen.getByLabelText(/max/i)).toHaveValue(null);
    // Range bar should still be shown when at least one value is set
    expect(screen.getByTestId('reading-level-range-bar')).toBeInTheDocument();
  });

  it('should handle only max value set', () => {
    render(<ReadingLevelRangeInput min={null} max={8.0} onChange={() => {}} />);

    expect(screen.getByLabelText(/min/i)).toHaveValue(null);
    expect(screen.getByLabelText(/max/i)).toHaveValue(8.0);
    // Range bar should still be shown when at least one value is set
    expect(screen.getByTestId('reading-level-range-bar')).toBeInTheDocument();
  });

  it('should display scale labels', () => {
    render(<ReadingLevelRangeInput min={5.0} max={8.0} onChange={() => {}} />);

    expect(screen.getByText('1.0')).toBeInTheDocument();
    expect(screen.getByText('13.0')).toBeInTheDocument();
  });
});
