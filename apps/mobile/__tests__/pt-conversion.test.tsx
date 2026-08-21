/**
 * Moving a member onto PT, from the trainer's side.
 *
 * The rule these tests exist to hold is that a member's programme changes
 * because a trainer decided it should — deliberately, once, and after a
 * confirmation. So most of what follows is about what does *not* happen: no
 * action for a member who is not eligible, no call when the trainer cancels,
 * and no local guess about a state only the server can confirm.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import TrainerClientScreen from '../app/(trainer)/client/[id]';
import { ApiError } from '../src/api/client';
import type { Journey, PTPackage, TrainerClientDetail } from '../src/api/types';
import { ConvertToPt, conversionState } from '../src/components/conversion';
import { dayLabel } from '../src/utils/format';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: jest.fn(),
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({ id: '42' }),
}));

const mockDetail = jest.fn();
const mockOptions = jest.fn();
const mockConvert = jest.fn();
jest.mock('../src/api/endpoints', () => ({
  myClientDetail: (...a: unknown[]) => mockDetail(...a),
  ptOptions: (...a: unknown[]) => mockOptions(...a),
  convertMemberToPt: (...a: unknown[]) => mockConvert(...a),
}));

const mockAuth = { withToken: (action: (t: string) => Promise<unknown>) => action('token') };
jest.mock('../src/store/AuthContext', () => ({ useAuth: () => mockAuth }));

async function draw(element: React.ReactElement) {
  const result = render(element);
  await act(async () => {});
  return result;
}

function aJourney(partial: Partial<Journey> = {}): Journey {
  return {
    id: 3,
    member_id: 42,
    member_name: 'Priyanka Das',
    branch_id: 1,
    journey_type: 'general_training',
    status: 'completed',
    start_date: '2026-07-01',
    end_date: '2026-08-14',
    duration_days: 45,
    assessment_days: 3,
    current_day: 46,
    phase: 'complete',
    split_today: 'rest',
    assessment_status: 'completed',
    cardio_completed: 3,
    cardio_required: 3,
    days_completed: 40,
    completion_pct: 100,
    workouts_completed: 30,
    pt_converted: false,
    ...partial,
  } as Journey;
}

function aPackage(partial: Partial<PTPackage> = {}): PTPackage {
  return {
    id: 9,
    member_id: 42,
    member_name: 'Priyanka Das',
    branch_id: 1,
    trainer_id: 5,
    trainer_name: 'Kiran Prasad',
    sessions_total: 12,
    sessions_used: 0,
    sessions_remaining: 12,
    status: 'active',
    start_date: '2026-08-17',
    expiry_date: null,
    origin: 'trainer_conversion',
    price_amount: null,
    currency: null,
    low_balance: false,
    ...partial,
  } as PTPackage;
}

function aDetail(partial: Partial<TrainerClientDetail['client']> = {}): TrainerClientDetail {
  return {
    client: {
      member_id: 42,
      member_code: 'SLAM-ALD-M01',
      full_name: 'Priyanka Das',
      branch_id: 1,
      joined_on: '2026-01-01',
      membership_plan: 'Annual',
      membership_status: 'active',
      days_remaining: 200,
      journey: aJourney(),
      pt_package: null,
      next_pt_session: null,
      last_seen_on: '2026-08-16',
      visits_last_30: 12,
      ...partial,
    },
    recent_sessions: [],
    recent_workouts: [],
    activity: [],
  } as TrainerClientDetail;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOptions.mockResolvedValue([12, 20, 30]);
  mockDetail.mockResolvedValue(aDetail());
});

/* ------------------------------------------------------------ eligibility */

describe('who can be converted', () => {
  it('is eligible once General Training is finished and there is no package', () => {
    expect(conversionState(aJourney(), null)).toBe('eligible');
  });

  it('is already PT when an active package exists', () => {
    // The package is the authority, not `pt_converted` — the package is what
    // the member actually trains on.
    expect(conversionState(aJourney(), aPackage())).toBe('already_pt');
  });

  it('is not eligible while the member is still training', () => {
    expect(conversionState(aJourney({ status: 'active' }), null)).toBe('not_eligible');
  });

  it('is not eligible with no programme at all', () => {
    expect(conversionState(null, null)).toBe('not_eligible');
  });

  it('treats a finished package as convertible again rather than as active PT', () => {
    expect(conversionState(aJourney(), aPackage({ status: 'completed' }))).toBe('eligible');
  });
});

/* --------------------------------------------------------------- the action */

describe('the action on the client screen', () => {
  it('offers the conversion for an eligible member', async () => {
    await draw(<TrainerClientScreen />);
    expect(screen.getByTestId('convert-to-pt')).toBeTruthy();
    expect(screen.getByText(/has finished General Training/)).toBeTruthy();
  });

  it('shows nothing at all for a member still in General Training', async () => {
    // Not a disabled button: that would invite a trainer to wonder what they
    // had done wrong.
    mockDetail.mockResolvedValue(aDetail({ journey: aJourney({ status: 'active' }) }));
    await draw(<TrainerClientScreen />);
    expect(screen.queryByTestId('convert-to-pt')).toBeNull();
    expect(screen.queryByTestId('pt-active')).toBeNull();
  });

  it('shows PT ACTIVE, and no action, for a member already converted', async () => {
    mockDetail.mockResolvedValue(aDetail({ pt_package: aPackage() }));
    await draw(<TrainerClientScreen />);
    expect(screen.getByTestId('pt-active')).toBeTruthy();
    expect(screen.getByText('PT ACTIVE')).toBeTruthy();
    expect(screen.queryByTestId('convert-to-pt')).toBeNull();
  });
});

/* ---------------------------------------------------------- confirmation */

describe('the confirmation', () => {
  it('states the consequence before anything happens', async () => {
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });

    expect(screen.getByText('Convert this member to PT?')).toBeTruthy();
    expect(
      screen.getByText('Trainer programming will become the active training plan.'),
    ).toBeTruthy();
    // Nothing has been sent yet.
    expect(mockConvert).not.toHaveBeenCalled();
  });

  it('sends nothing when the trainer cancels', async () => {
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('cancel-convert'));
    });

    expect(mockConvert).not.toHaveBeenCalled();
    // And the action is still there to try again.
    expect(screen.getByTestId('convert-to-pt')).toBeTruthy();
  });

  it('offers only the package sizes the branch sells', async () => {
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    // By testID, not by text: "12" is also this member's 30-day visit count.
    expect(screen.getByTestId('convert-size-12')).toBeTruthy();
    expect(screen.getByTestId('convert-size-20')).toBeTruthy();
    expect(screen.getByTestId('convert-size-30')).toBeTruthy();
    expect(screen.queryByTestId('convert-size-8')).toBeNull();
  });

  it('sends the size the trainer picked, not the default', async () => {
    mockConvert.mockResolvedValue({ member_id: 42 });
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-size-30'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-convert'));
    });

    expect(mockConvert).toHaveBeenCalledWith(42, { sessions_total: 30, confirm: true }, 'token');
  });
});

/* ------------------------------------------------------------ converting */

describe('converting', () => {
  it('sends the confirmed decision and re-reads the client', async () => {
    mockConvert.mockResolvedValue({ member_id: 42, to_training_type: 'pt' });
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-convert'));
    });

    expect(mockConvert).toHaveBeenCalledWith(42, { sessions_total: 12, confirm: true }, 'token');
    // Re-read rather than patched locally: only the server can confirm this.
    await waitFor(() => expect(mockDetail).toHaveBeenCalledTimes(2));
  });

  it('shows PT ACTIVE once the server confirms it', async () => {
    mockConvert.mockResolvedValue({ member_id: 42 });
    mockDetail
      .mockResolvedValueOnce(aDetail())
      .mockResolvedValue(aDetail({ pt_package: aPackage() }));

    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-convert'));
    });

    await waitFor(() => expect(screen.getByTestId('pt-active')).toBeTruthy());
    expect(screen.queryByTestId('convert-to-pt')).toBeNull();
  });

  it('reports a failure in the server’s own words and keeps the action', async () => {
    mockConvert.mockRejectedValue(new ApiError(500, 'server_error', 'GymFlow is not responding.'));
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-convert'));
    });

    await waitFor(() => expect(screen.getByText('GymFlow is not responding.')).toBeTruthy());
    expect(screen.getByTestId('convert-to-pt')).toBeTruthy();
  });

  it('says something useful when the trainer is not allowed', async () => {
    mockConvert.mockRejectedValue(
      new ApiError(403, 'forbidden', 'Only this member’s trainer can convert them.'),
    );
    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-convert'));
    });

    await waitFor(() =>
      expect(screen.getByText('Only this member’s trainer can convert them.')).toBeTruthy(),
    );
  });

  it('treats "already converted" as a success and refreshes', async () => {
    // Somebody else got there first — from this screen that is the outcome
    // the trainer wanted, not an error to explain.
    mockConvert.mockRejectedValue(
      new ApiError(409, 'already_pt', 'Priyanka Das is already on a personal-training package.'),
    );
    mockDetail
      .mockResolvedValueOnce(aDetail())
      .mockResolvedValue(aDetail({ pt_package: aPackage() }));

    await draw(<TrainerClientScreen />);
    await act(async () => {
      fireEvent.press(screen.getByTestId('convert-to-pt'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirm-convert'));
    });

    await waitFor(() => expect(screen.getByTestId('pt-active')).toBeTruthy());
    expect(screen.queryByText(/already on a personal-training package/)).toBeNull();
  });

  it('shows the action as busy while the request is in flight', async () => {
    let release: (value: unknown) => void = () => {};
    mockConvert.mockReturnValue(new Promise((resolve) => (release = resolve)));

    await draw(
      <ConvertToPt
        state="eligible"
        memberName="Priyanka Das"
        options={[12]}
        busy
        onConvert={() => {}}
      />,
    );
    // `loading` disables the Button, so a second tap cannot double-convert.
    expect(screen.getByTestId('convert-to-pt').props.accessibilityState.disabled).toBe(true);
    release(null);
  });
});

/* ---------------------------------------------------------------- last seen */

describe('last seen', () => {
  // The value used to be the date string split on its first space, showing
  // a bare weekday fragment as the headline, with the same full date
  // repeated a second time as the hint. Fixed once by showing one clean
  // date instead of two fragments — but that date still carried a weekday,
  // which is long enough at this card's 28px mono digits to clip against
  // the narrow third of a three-across stat row on a real device. The
  // value is now day + month only; the weekday's context lives in the
  // "Yesterday" / "N days ago" hint instead, not dropped, just relocated.
  it('renders a value short enough not to need a weekday', async () => {
    mockDetail.mockResolvedValue(aDetail({ last_seen_on: '2026-08-19' }));
    const full = dayLabel('2026-08-19');
    await draw(<TrainerClientScreen />);
    // Nothing repeats the weekday-bearing full date as the headline value.
    expect(screen.queryByText(full)).toBeNull();
    expect(screen.queryByText(full.split(' ')[0])).toBeNull();
  });

  it('still says which day, and how recently, without duplicating either', async () => {
    mockDetail.mockResolvedValue(aDetail({ last_seen_on: '2026-08-19' }));
    await draw(<TrainerClientScreen />);
    // Day + month (no weekday) as the value, "days ago" as the hint —
    // present exactly once each, not merged and not repeated.
    expect(screen.getAllByText(/\b19\b/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ago|Today|Yesterday/)).toBeTruthy();
  });
});

/* --------------------------------------------------------- expired membership */

describe('expired membership', () => {
  it('reads as an explicit past-tense state rather than a negative countdown', async () => {
    mockDetail.mockResolvedValue(
      aDetail({ membership_status: 'expired', days_remaining: -5 }),
    );
    await draw(<TrainerClientScreen />);
    expect(screen.getByText('Expired 5 days ago')).toBeTruthy();
    expect(screen.queryByText('-5 days remaining')).toBeNull();
    expect(screen.queryByText(/^-5/)).toBeNull();
  });

  it('still counts down normally while active', async () => {
    mockDetail.mockResolvedValue(aDetail({ days_remaining: 17 }));
    await draw(<TrainerClientScreen />);
    expect(screen.getByText('17 days left')).toBeTruthy();
  });
});

/* --------------------------------------------------------- InBody placeholder */

describe('InBody placeholder copy', () => {
  it('explains the gap in plain language, not implementation detail', async () => {
    await draw(<TrainerClientScreen />);
    expect(
      screen.getByText(
        "Body composition isn't tracked yet. Scans will appear here once InBody is turned on for your gym.",
      ),
    ).toBeTruthy();
  });

  it('never mentions the underlying schema or storage', async () => {
    await draw(<TrainerClientScreen />);
    for (const term of [/scan table/i, /nothing writes to it/i]) {
      expect(screen.queryByText(term)).toBeNull();
    }
  });
});

/* ------------------------------------------------------------ back navigation */

describe('back navigation', () => {
  it('returns to whichever screen pushed this one', async () => {
    mockCanGoBack.mockReturnValue(true);
    await draw(<TrainerClientScreen />);
    fireEvent.press(screen.getByText('Back to clients'));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to Clients only when there is no history to unwind', async () => {
    mockCanGoBack.mockReturnValue(false);
    await draw(<TrainerClientScreen />);
    fireEvent.press(screen.getByText('Back to clients'));
    expect(mockReplace).toHaveBeenCalledWith('/(trainer)/clients');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
