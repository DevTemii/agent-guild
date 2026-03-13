// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FreelanceEscrow {
    enum Status {
        Created,
        Funded,
        Submitted,
        Released,
        Cancelled
    }

    struct Project {
        address client;
        address freelancer;
        uint256 amount;
        Status status;
    }

    uint256 public projectCount;
    mapping(uint256 => Project) public projects;

    function createProject(address _freelancer) external returns (uint256) {
        require(_freelancer != address(0), "Invalid freelancer");
        require(_freelancer != msg.sender, "Client cannot be freelancer");

        projectCount++;

        projects[projectCount] = Project({
            client: msg.sender,
            freelancer: _freelancer,
            amount: 0,
            status: Status.Created
        });

        return projectCount;
    }

    function deposit(uint256 _projectId) external payable {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.client, "Only client can deposit");
        require(project.status == Status.Created, "Project not in created state");
        require(msg.value > 0, "Deposit must be greater than zero");

        project.amount = msg.value;
        project.status = Status.Funded;
    }

    function submitWork(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.freelancer, "Only freelancer can submit");
        require(project.status == Status.Funded, "Project not funded");

        project.status = Status.Submitted;
    }

    function approveAndRelease(uint256 _projectId) external {
        Project storage project = projects[_projectId];

        require(project.client != address(0), "Project does not exist");
        require(msg.sender == project.client, "Only client can approve");
        require(project.status == Status.Submitted, "Work not submitted");
        require(project.amount > 0, "No funds deposited");

        uint256 amount = project.amount;
        project.amount = 0;
        project.status = Status.Released;

        (bool sent, ) = payable(project.freelancer).call{value: amount}("");
        require(sent, "Transfer failed");
    }

    function getProject(uint256 _projectId)
        external
        view
        returns (
            address client,
            address freelancer,
            uint256 amount,
            Status status
        )
    {
        Project memory project = projects[_projectId];
        return (
            project.client,
            project.freelancer,
            project.amount,
            project.status
        );
    }
}