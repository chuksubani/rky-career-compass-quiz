/*
 * job-titles.js — Q03 suggestions. Draft list, not from the workbook. Never scored.
 * Each entry: [title, ...aliases].
 */
(function (root) {
  'use strict';
  var T = [
    ['Account Manager'], ['Accountant'], ['Accounts Assistant', 'accounts clerk'], ['Administrative Assistant', 'admin assistant', 'admin'],
    ['Administrator', 'admin'], ['AML Analyst', 'anti money laundering'], ['Analyst'], ['Applications Developer'], ['Assistant Manager'],
    ['Auditor', 'internal auditor'], ['Bank Teller', 'cashier'], ['Barista'], ['Bookkeeper'], ['Branch Manager'],
    ['Business Analyst', 'BA'], ['Business Development Manager', 'BDM'], ['Business Development Executive', 'BDE'],
    ['Business Owner', 'self employed', 'entrepreneur'], ['Business Systems Analyst'], ['Care Assistant', 'carer', 'care worker', 'support worker'],
    ['Cashier'], ['Chef'], ['Civil Engineer'], ['Claims Handler', 'claims advisor'], ['Cleaner'], ['Client Services Associate'],
    ['Compliance Analyst'], ['Compliance Officer'], ['Content Writer', 'copywriter'], ['Contact Centre Agent', 'call centre agent', 'call center agent'],
    ['Credit Analyst'], ['Customer Service Advisor', 'customer care', 'customer service'], ['Customer Service Assistant', 'customer service'],
    ['Customer Service Representative', 'customer service rep', 'CSR'], ['Customer Success Manager', 'CSM'], ['Cyber Security Analyst', 'cybersecurity', 'security analyst'],
    ['Data Analyst'], ['Data Entry Clerk', 'data entry'], ['Data Engineer'], ['Data Scientist'], ['Database Administrator', 'DBA'],
    ['Delivery Driver', 'driver'], ['Designer', 'graphic designer'], ['DevOps Engineer'], ['Digital Marketing Executive', 'digital marketer'],
    ['Driver'], ['Electrician'], ['Engineer'], ['Event Coordinator', 'events'], ['Executive Assistant', 'EA', 'PA'],
    ['Finance Analyst', 'financial analyst'], ['Finance Manager'], ['Finance Officer'], ['Financial Advisor', 'financial adviser'],
    ['Fraud Analyst', 'fraud investigator'], ['Front End Developer', 'frontend developer'], ['Full Stack Developer', 'fullstack developer'],
    ['General Manager'], ['Graphic Designer'], ['Healthcare Assistant', 'HCA'], ['Help Desk Analyst', 'helpdesk', 'service desk analyst'],
    ['HR Administrator', 'human resources'], ['HR Manager', 'human resources manager'], ['HR Officer', 'human resources'], ['IT Support Analyst', 'IT support'],
    ['IT Manager'], ['IT Support Specialist', 'IT support', 'desktop support'], ['IT Technician', 'IT support'], ['Information Security Analyst', 'infosec'],
    ['Junior Developer'], ['KYC Analyst', 'know your customer'], ['Lecturer'], ['Legal Assistant', 'paralegal'], ['Logistics Coordinator', 'logistics'],
    ['Machine Learning Engineer', 'ML engineer'], ['Marketing Assistant'], ['Marketing Coordinator'], ['Marketing Executive'], ['Marketing Manager'],
    ['Mechanical Engineer'], ['Nurse', 'registered nurse'], ['Office Administrator', 'office admin'], ['Office Manager'], ['Operations Analyst'],
    ['Operations Coordinator'], ['Operations Executive'], ['Operations Manager'], ['Pharmacist'], ['Pharmacy Assistant'], ['Product Manager', 'PM'],
    ['Product Owner'], ['Programme Manager', 'program manager'], ['Project Administrator', 'project admin'], ['Project Coordinator'], ['Project Manager', 'PM'],
    ['Quality Assurance Analyst', 'QA analyst', 'tester'], ['Receptionist', 'front desk'], ['Recruiter', 'talent acquisition'], ['Recruitment Consultant'],
    ['Relationship Manager'], ['Research Assistant'], ['Retail Assistant', 'sales assistant', 'shop assistant'], ['Retail Manager', 'store manager'],
    ['Risk Analyst'], ['Sales Advisor', 'sales adviser'], ['Sales Assistant'], ['Sales Executive'], ['Sales Manager'], ['Sales Representative', 'sales rep'],
    ['Scrum Master'], ['Secretary'], ['Security Officer', 'security guard'], ['Social Media Manager'], ['Social Worker'], ['Software Developer', 'software engineer'],
    ['Software Engineer', 'software developer'], ['Solutions Architect'], ['Store Manager'], ['Supervisor', 'team leader'], ['Supply Chain Analyst'],
    ['Support Worker', 'care assistant'], ['System Administrator', 'sysadmin'], ['Teacher'], ['Teaching Assistant', 'TA'], ['Team Leader', 'supervisor'],
    ['Technical Support Engineer', 'tech support'], ['Tutor'], ['UX Designer'], ['Virtual Assistant', 'VA'], ['Warehouse Operative', 'warehouse worker'],
    ['Web Developer'], ['Student'], ['Graduate'], ['Intern', 'internship'], ['Freelancer'], ['Volunteer']
  ];
  var seen = {};
  root.QUIZ_SUGGESTIONS = root.QUIZ_SUGGESTIONS || {};
  root.QUIZ_SUGGESTIONS.jobTitles = T.filter(function (e) {
    return seen[e[0]] ? false : (seen[e[0]] = true);
  }).map(function (e) { return { text: e[0], aliases: e.slice(1) }; });
}(typeof self !== 'undefined' ? self : this));
