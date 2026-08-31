export default function ResumeCard({ resume }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      padding: '1rem',
      marginBottom: '1rem'
    }}>
      <h3>{resume.name} - {resume.title} at {resume.company}</h3>
      <p>Level: {resume.level}</p>
      <p>University: {resume.university}</p>
      <p>City: {resume.city}</p>
      <p>Years of Experience: {resume.yearsOfExperience}</p>
    </div>
  );
}
