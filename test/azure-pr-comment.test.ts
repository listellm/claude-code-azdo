import { describe, test, expect, vi, beforeEach } from "vitest";
import { REVIEWER_VOTE } from "../src/pr-comment-core";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("azure-pipelines-task-lib/task", () => ({
  getVariable: vi.fn(),
  getBoolInput: vi.fn(),
  getInput: vi.fn(),
  setVariable: vi.fn(),
  setResult: vi.fn(),
}));

vi.mock("../src/pr-comment-core", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/pr-comment-core")>();
  return {
    ...original,
    approvePullRequest: vi.fn(),
  };
});

// Must import AFTER vi.mock declarations
import * as tl from "azure-pipelines-task-lib/task";
import { approvePullRequest } from "../src/pr-comment-core";
import { votePr } from "../src/azure-pr-comment";

const mockedGetVariable = vi.mocked(tl.getVariable);
const mockedApprovePullRequest = vi.mocked(approvePullRequest);

// ---------------------------------------------------------------------------
// votePr
// ---------------------------------------------------------------------------

describe("votePr", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default: all pipeline vars present
    mockedGetVariable.mockImplementation((name: string) => {
      const vars: Record<string, string> = {
        "System.PullRequest.PullRequestId": "42",
        "System.CollectionUri": "https://dev.azure.com/myorg/",
        "System.TeamProject": "Platform",
        "Build.Repository.ID": "repo-abc",
      };
      return vars[name];
    });
    mockedApprovePullRequest.mockResolvedValue(undefined);
  });

  test("logs and returns early when not a PR run", async () => {
    mockedGetVariable.mockReturnValue(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await votePr("token", REVIEWER_VOTE.APPROVED as 10);

    expect(mockedApprovePullRequest).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Not a PR run"),
    );
  });

  test("warns and returns early when missing pipeline variables", async () => {
    // Return prId but nothing else
    mockedGetVariable.mockImplementation((name: string) => {
      if (name === "System.PullRequest.PullRequestId") return "42";
      return undefined;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await votePr("token", REVIEWER_VOTE.APPROVED as 10);

    expect(mockedApprovePullRequest).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing required pipeline variables"),
    );
  });

  test("calls approvePullRequest with APPROVED vote and logs success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await votePr("token", REVIEWER_VOTE.APPROVED as 10);

    expect(mockedApprovePullRequest).toHaveBeenCalledOnce();
    expect(mockedApprovePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ prId: "42" }),
      10,
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Approved PR #42"),
    );
  });

  test("calls approvePullRequest with WAITING_FOR_AUTHOR and logs success", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await votePr("token", REVIEWER_VOTE.WAITING_FOR_AUTHOR as -5);

    expect(mockedApprovePullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ prId: "42" }),
      -5,
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Set PR #42 to waiting for author"),
    );
  });

  test("catches approvePullRequest failure and warns without throwing", async () => {
    mockedApprovePullRequest.mockRejectedValue(
      new Error("ADO API returned 403"),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      votePr("token", REVIEWER_VOTE.APPROVED as 10),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to submit reviewer vote"),
    );
  });
});
